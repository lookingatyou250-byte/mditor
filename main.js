const { app, BrowserWindow, Menu, dialog, ipcMain, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { fileURLToPath, pathToFileURL } = require('url');
const { execFile } = require('child_process');
const fileTypes = require('./js/core/fileTypes');

const MAX_TEXT_FILE_BYTES = 20 * 1024 * 1024; // 20 MB 防卡死保护

/**
 * 安全读取纯文本 / Markdown / 代码 / 配置 / CSV 文件，自动拦截二进制文件
 */
function readTextFileSafe(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
        return { ok: false, error: '文件不存在' };
    }
    if (fileTypes.isKnownBinary(filePath)) {
        return { ok: false, error: '不支持打开二进制或非文本文件' };
    }
    try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) {
            return { ok: false, error: '目标不是普通文件' };
        }
        if (stat.size > MAX_TEXT_FILE_BYTES) {
            return { ok: false, error: '文件超过 20 MB，为保持轻量流畅已跳过打开' };
        }
        const buf = fs.readFileSync(filePath);
        if (fileTypes.isBinaryBuffer(buf)) {
            return { ok: false, error: '检测到二进制内容，不支持打开此类文件' };
        }
        return { ok: true, content: buf.toString('utf-8') };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

// ========== 单实例模式 ==========
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    // 已经有一个实例在运行，立即退出
    app.exit(0);
}

/**
 * 判断命令行参数是否为需要打开的目标文档文件（排除 electron/mditor 可执行文件自身与内部包）
 */
function resolveLaunchDocPath(arg, baseDir) {
    const cleaned = String(arg || '').replace(/^"|"$/g, '').trim();
    if (!cleaned || cleaned.startsWith('--') || cleaned.startsWith('-')) return null;
    const lower = cleaned.toLowerCase();
    if (lower.endsWith('.exe') || lower.endsWith('.asar') || lower.endsWith('main.js')) return null;
    try {
        const normalizedPath = baseDir ? path.resolve(baseDir, cleaned) : path.resolve(cleaned);
        if (normalizedPath === process.execPath) return null;
        const stat = fs.statSync(normalizedPath);
        if (stat.isFile()) {
            return normalizedPath;
        }
    } catch {
        return null;
    }
    return null;
}

// 监听第二个实例的启动（只有获得锁的实例会到达这里）
app.on('second-instance', (event, commandLine, workingDirectory) => {
    // 从命令行参数中提取文件路径
    const args = commandLine.slice(1);
    let filePath = null;
    for (const arg of args) {
        const resolved = resolveLaunchDocPath(arg, workingDirectory);
        if (resolved) {
            filePath = resolved;
            break;
        }
    }
    // 创建或复用窗口
    if (filePath) {
        openFileInApp(filePath);
    } else {
        createWindow(null);
    }
});

// ========== 多窗口状态管理 ==========
// 每个窗口维护自己的状态（通过 webContents.id 关联）
const windowStates = new Map();

/**
 * 清理指定窗口的文件监听
 */
function clearWindowWatcher(state) {
    if (!state) return;
    if (state.watchDebounce) {
        clearTimeout(state.watchDebounce);
        state.watchDebounce = null;
    }
    if (state.watcher) {
        try {
            state.watcher.close();
        } catch {
            // ignore
        }
        state.watcher = null;
    }
    state.watchedPath = null;
}

/**
 * 监听当前窗口打开的文件，实现外部修改自动热刷新
 */
function watchWindowFile(win, filePath) {
    if (!win || win.isDestroyed()) return;
    const state = windowStates.get(win.webContents.id);
    if (!state) return;

    if (!filePath || !fs.existsSync(filePath)) {
        clearWindowWatcher(state);
        return;
    }

    const normalized = path.normalize(filePath);
    if (state.watchedPath === normalized && state.watcher) {
        return;
    }

    clearWindowWatcher(state);
    state.watchedPath = normalized;

    const dir = path.dirname(normalized);
    const targetName = path.basename(normalized).toLowerCase();

    try {
        // 监听所在目录比直接监听单文件更稳健（兼容原子保存 / 先写临时文件再 rename）
        state.watcher = fs.watch(dir, { persistent: false }, (_eventType, filename) => {
            if (filename && path.basename(filename.toString()).toLowerCase() !== targetName) {
                return;
            }
            if (state.watchDebounce) {
                clearTimeout(state.watchDebounce);
            }
            state.watchDebounce = setTimeout(() => {
                if (win.isDestroyed()) return;
                // 忽略自身刚保存触发的事件
                if (Date.now() - (state.lastSelfWriteTime || 0) < 900) {
                    return;
                }
                if (!fs.existsSync(normalized)) return;
                try {
                    const content = fs.readFileSync(normalized, 'utf-8');
                    win.webContents.send('file-externally-changed', {
                        filePath: normalized,
                        fileName: path.basename(normalized),
                        content
                    });
                } catch {
                    // 文件可能正处于写入中，忽略瞬时读取错误
                }
            }, 250);
        });
        state.watcher.on('error', () => {
            clearWindowWatcher(state);
        });
    } catch (e) {
        console.error('Failed to watch file:', e);
        clearWindowWatcher(state);
    }
}

// ========== 全局主题状态 ==========
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
    try {
        if (fs.existsSync(settingsPath)) {
            return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        }
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
    return { theme: 'light' };
}

function saveSettings(settings) {
    try {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    } catch (e) {
        console.error('Failed to save settings:', e);
    }
}

let globalSettings = loadSettings();

// ========== 捕获启动参数 ==========
let launchFilePath = null;
{
    const args = process.argv.slice(app.isPackaged ? 1 : 2);
    for (const arg of args) {
        const resolved = resolveLaunchDocPath(arg, process.cwd());
        if (resolved) {
            launchFilePath = resolved;
            break;
        }
    }
}

/**
 * 在已有空闲窗口打开文件或创建新窗口
 */
function openFileInApp(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return;
    const normalized = path.normalize(filePath);

    // 1. 若已有窗口正打开同一文件，直接聚焦该窗口
    for (const win of BrowserWindow.getAllWindows()) {
        if (win.isDestroyed()) continue;
        const state = windowStates.get(win.webContents.id);
        if (state && state.filePath === normalized) {
            if (win.isMinimized()) win.restore();
            win.focus();
            return;
        }
    }

    // 2. 若已有未关联文件的初始窗口（如欢迎/演示页），直接复用该窗口
    for (const win of BrowserWindow.getAllWindows()) {
        if (win.isDestroyed()) continue;
        const state = windowStates.get(win.webContents.id);
        if (state && !state.filePath && !state.pendingFile) {
            const readRes = readTextFileSafe(normalized);
            if (!readRes.ok) {
                if (win.isMinimized()) win.restore();
                win.focus();
                win.webContents.send('file-opened', { error: readRes.error });
                return;
            }
            state.filePath = normalized;
            app.addRecentDocument(normalized);
            watchWindowFile(win, normalized);
            win.webContents.send('file-opened', {
                content: readRes.content,
                fileName: path.basename(normalized),
                filePath: normalized
            });
            if (win.isMinimized()) win.restore();
            win.focus();
            return;
        }
    }

    // 3. 否则创建新窗口
    createWindow(normalized);
}

// macOS: open-file 事件
app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (app.isReady()) {
        openFileInApp(filePath);
    } else {
        launchFilePath = filePath;
    }
});

// ========== 窗口创建 ==========
function createWindow(filePathToOpen = null) {
    const win = new BrowserWindow({
        width: 1060,
        height: 740,
        minWidth: 600,
        minHeight: 400,
        frame: false,  // 无边框窗口
        titleBarStyle: 'hidden',
        trafficLightPosition: { x: 14, y: 11 },  // macOS 红绿灯垂直居中于 38px 标题栏
        backgroundColor: globalSettings.theme === 'dark' ? '#21201C' : '#F4F1EA',  // 匹配 Claude 羊皮纸/暖炭黑背景防止启动闪烁
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'assets/icon.png'),
        show: false
    });

    // 初始化窗口状态
    windowStates.set(win.webContents.id, {
        filePath: filePathToOpen,
        pendingFile: filePathToOpen,
        watcher: null,
        watchedPath: null,
        watchDebounce: null,
        lastSelfWriteTime: 0
    });

    // 拦截外部链接与意外导航，防止窗口离开 index.html 导致卡死或唤起系统记事本
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url && (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('mailto:'))) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    win.webContents.on('will-navigate', (event, url) => {
        // 只允许应用自身的 index.html（如刷新），阻止任何其他页面/本地文件导航
        const indexUrl = pathToFileURL(path.join(__dirname, 'index.html')).href;
        if (url === indexUrl || url.startsWith(indexUrl + '#') || url.startsWith(indexUrl + '?')) {
            return;
        }
        event.preventDefault();
        if (url && (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('mailto:'))) {
            shell.openExternal(url);
        }
    });

    win.loadFile('index.html');

    win.once('ready-to-show', () => {
        win.show();
    });

    // 保存 ID 用于清理（因为 closed 事件时 webContents 已销毁）
    const webContentsId = win.webContents.id;

    // 窗口即将关闭时询问是否保存高亮或未保存内容（若渲染进程未就绪则直接放行，杜绝卡死）
    win.on('close', async (e) => {
        e.preventDefault();

        try {
            const canClose = await win.webContents.executeJavaScript(
                '(window.app && typeof window.app._handleWindowClose === "function") ? window.app._handleWindowClose() : true'
            );
            if (canClose !== false) {
                win.destroy();
            }
        } catch (error) {
            console.error('检查关闭条件失败:', error);
            win.destroy();
        }
    });

    // 窗口关闭时清理状态和文件监听
    win.on('closed', () => {
        clearWindowWatcher(windowStates.get(webContentsId));
        windowStates.delete(webContentsId);
    });

    // 全屏状态变化通知渲染进程（用于 macOS 红绿灯占位内边距调整）
    win.on('enter-full-screen', () => {
        if (!win.isDestroyed()) {
            win.webContents.send('fullscreen-changed', true);
        }
    });

    win.on('leave-full-screen', () => {
        if (!win.isDestroyed()) {
            win.webContents.send('fullscreen-changed', false);
        }
    });

    // 隐藏菜单栏（Windows/Linux）
    if (process.platform !== 'darwin') {
        win.setMenuBarVisibility(false);
        win.setAutoHideMenuBar(true);
    }

    return win;
}

// ========== IPC 处理 ==========
// Renderer 拉取初始文件
ipcMain.handle('get-initial-file', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const state = windowStates.get(event.sender.id);
    if (state && state.pendingFile && fs.existsSync(state.pendingFile)) {
        const target = state.pendingFile;
        state.pendingFile = null;  // 消费一次
        const readRes = readTextFileSafe(target);
        if (!readRes.ok) {
            state.filePath = null;
            return { error: readRes.error };
        }
        state.filePath = target;
        app.addRecentDocument(state.filePath);
        watchWindowFile(win, state.filePath);
        return {
            content: readRes.content,
            fileName: path.basename(target),
            filePath: target
        };
    }
    return null;
});

// 打开文件对话框（支持 Markdown、代码、配置、日志、CSV 等所有纯文本）
ipcMain.handle('open-file-dialog', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [
            { name: '所有文本与代码', extensions: fileTypes.getAllSupportedExtensions() },
            { name: 'Markdown 文档', extensions: ['md', 'markdown', 'mdx', 'mkd'] },
            { name: '代码与配置', extensions: ['js', 'ts', 'jsx', 'tsx', 'json', 'py', 'sh', 'css', 'html', 'yml', 'yaml', 'toml', 'sql', 'swift', 'go', 'rs'] },
            { name: '纯文本 / 日志 / 表格', extensions: ['txt', 'log', 'csv', 'tsv', 'ini', 'conf', 'env'] },
            { name: '所有文件', extensions: ['*'] }
        ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        const readRes = readTextFileSafe(filePath);
        if (!readRes.ok) {
            return { error: readRes.error };
        }
        const state = windowStates.get(event.sender.id);
        if (state) state.filePath = filePath;
        app.addRecentDocument(filePath);
        watchWindowFile(win, filePath);
        return {
            content: readRes.content,
            fileName: path.basename(filePath),
            filePath
        };
    }
    return null;
});

// 打开文件夹对话框
ipcMain.handle('open-folder-dialog', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory']
    });

    if (!result.canceled && result.filePaths.length > 0) {
        return { folderPath: result.filePaths[0] };
    }
    return null;
});

// 检查路径类型（用于拖拽文件或文件夹）
ipcMain.handle('stat-path', async (_event, targetPath) => {
    try {
        if (!targetPath || !fs.existsSync(targetPath)) return null;
        const stat = fs.statSync(targetPath);
        return {
            isFile: stat.isFile(),
            isDirectory: stat.isDirectory(),
            path: path.normalize(targetPath),
            name: path.basename(targetPath)
        };
    } catch {
        return null;
    }
});

// 递归列出指定目录下的 Markdown 与纯文本/代码文件（用于 Cmd/Ctrl+P 快速跳转）
ipcMain.handle('list-markdown-files', async (_event, rootDir) => {
    if (!rootDir || !fs.existsSync(rootDir)) return [];
    const ignoredDirs = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.cache', '.obsidian', '.claude', '__pycache__', '.venv', 'venv', 'target']);
    const results = [];
    const maxFiles = 600;
    const maxDepth = 4;

    function walk(dir, depth) {
        if (depth > maxDepth || results.length >= maxFiles) return;
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (results.length >= maxFiles) break;
            if (entry.name.startsWith('.') && entry.name !== '.env' && entry.name !== '.gitignore') continue;
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!ignoredDirs.has(entry.name)) {
                    walk(fullPath, depth + 1);
                }
            } else if (entry.isFile()) {
                if (fileTypes.isSupportedTextFile(entry.name)) {
                    results.push({
                        name: entry.name,
                        path: fullPath,
                        relativePath: path.relative(rootDir, fullPath)
                    });
                }
            }
        }
    }

    walk(rootDir, 0);
    return results;
});

// 导出当前文档为 PDF
ipcMain.handle('export-pdf', async (event, defaultName) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return { success: false, error: '窗口不可用' };

    const state = windowStates.get(event.sender.id);
    const baseName = (defaultName || (state?.filePath ? path.basename(state.filePath, path.extname(state.filePath)) : 'document')).replace(/\.[^.]+$/, '');
    const defaultDir = state?.filePath ? path.dirname(state.filePath) : app.getPath('documents');

    const saveResult = await dialog.showSaveDialog(win, {
        title: '导出为 PDF',
        defaultPath: path.join(defaultDir, `${baseName}.pdf`),
        filters: [{ name: 'PDF 文档', extensions: ['pdf'] }]
    });

    if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, canceled: true };
    }

    try {
        const pdfBuffer = await win.webContents.printToPDF({
            printBackground: true,
            pageSize: 'A4',
            margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
        });
        fs.writeFileSync(saveResult.filePath, pdfBuffer);
        return {
            success: true,
            filePath: saveResult.filePath,
            fileName: path.basename(saveResult.filePath)
        };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// 保存文件
ipcMain.handle('save-file', async (event, { content, forceDialog }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const state = windowStates.get(event.sender.id);
    const currentPath = state?.filePath;

    // 如果有当前文件路径且不强制弹窗，直接保存
    if (currentPath && !forceDialog) {
        try {
            if (state) state.lastSelfWriteTime = Date.now();
            fs.writeFileSync(currentPath, content, 'utf-8');
            watchWindowFile(win, currentPath);
            return { success: true, filePath: currentPath, fileName: path.basename(currentPath) };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    // 否则弹出另存为对话框
    const result = await dialog.showSaveDialog(win, {
        defaultPath: currentPath || 'untitled.md',
        filters: [
            { name: 'Markdown', extensions: ['md'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (result.canceled) {
        return { success: false, canceled: true };
    }

    try {
        if (state) state.lastSelfWriteTime = Date.now();
        fs.writeFileSync(result.filePath, content, 'utf-8');
        if (state) state.filePath = result.filePath;
        app.addRecentDocument(result.filePath);
        watchWindowFile(win, result.filePath);
        return { success: true, filePath: result.filePath, fileName: path.basename(result.filePath) };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// 同步当前窗口文件路径（拖拽打开 / 新建空白文件时调用）
ipcMain.handle('set-current-file', async (event, filePath) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const state = windowStates.get(event.sender.id);
    if (!state) return false;

    if (filePath && fs.existsSync(filePath)) {
        state.filePath = path.normalize(filePath);
        app.addRecentDocument(state.filePath);
        watchWindowFile(win, state.filePath);
        return true;
    }

    state.filePath = null;
    clearWindowWatcher(state);
    return true;
});

// 获取应用版本号
ipcMain.handle('get-app-version', () => {
    return require('./package.json').version;
});

// 新建窗口
ipcMain.on('new-window', () => {
    createWindow();
});

// 打开外部链接
ipcMain.handle('open-external', async (event, url) => {
    if (url && (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('mailto:'))) {
        await shell.openExternal(url);
        return true;
    }
    return false;
});

// 解析并打开文档内部的本地链接（.md 链接在 mditor 内直接打开，非 md 文件交由系统打开）
ipcMain.handle('open-local-link', async (event, { href, baseDir, openInNewWindow }) => {
    if (!href) return { ok: false, error: '无效链接' };

    const win = BrowserWindow.fromWebContents(event.sender);
    const state = windowStates.get(event.sender.id);
    const rawHref = String(href).trim();

    // 分离 #锚点 和 ?查询参数
    let pathPart = rawHref;
    let hash = '';
    const hashIdx = pathPart.indexOf('#');
    if (hashIdx >= 0) {
        hash = pathPart.slice(hashIdx + 1);
        pathPart = pathPart.slice(0, hashIdx);
    }
    const queryIdx = pathPart.indexOf('?');
    if (queryIdx >= 0) {
        pathPart = pathPart.slice(0, queryIdx);
    }

    let resolvedPath = null;
    try {
        if (/^file:/i.test(pathPart)) {
            resolvedPath = fileURLToPath(pathPart);
        } else {
            let decoded = pathPart;
            try {
                decoded = decodeURIComponent(pathPart);
            } catch {
                decoded = pathPart;
            }
            if (path.isAbsolute(decoded) || /^[a-zA-Z]:[\\/]/.test(decoded)) {
                resolvedPath = path.normalize(decoded);
            } else {
                const anchorDir = baseDir || (state?.filePath ? path.dirname(state.filePath) : null);
                if (!anchorDir) {
                    return { ok: false, error: '当前文档尚未保存，无法解析相对路径链接' };
                }
                resolvedPath = path.resolve(anchorDir, decoded);
            }
        }
    } catch (e) {
        return { ok: false, error: `链接路径无效: ${e.message}` };
    }

    // 如果路径不带扩展名但存在同名 .md 文件，自动补全 .md
    if (!fs.existsSync(resolvedPath) && fs.existsSync(`${resolvedPath}.md`)) {
        resolvedPath = `${resolvedPath}.md`;
    }

    if (!fs.existsSync(resolvedPath)) {
        return { ok: false, error: `找不到链接目标: ${path.basename(resolvedPath)}` };
    }

    let stat;
    try {
        stat = fs.statSync(resolvedPath);
    } catch (e) {
        return { ok: false, error: e.message };
    }

    if (stat.isDirectory()) {
        return { ok: true, kind: 'directory', folderPath: resolvedPath };
    }

    if (fileTypes.isSupportedTextFile(resolvedPath)) {
        if (openInNewWindow) {
            createWindow(resolvedPath);
            return { ok: true, kind: 'new-window', filePath: resolvedPath };
        }
        const readRes = readTextFileSafe(resolvedPath);
        if (!readRes.ok) {
            return { ok: false, error: readRes.error };
        }
        if (state) state.filePath = resolvedPath;
        app.addRecentDocument(resolvedPath);
        watchWindowFile(win, resolvedPath);
        return {
            ok: true,
            kind: 'markdown',
            content: readRes.content,
            fileName: path.basename(resolvedPath),
            filePath: resolvedPath,
            hash: hash ? decodeURIComponent(hash) : ''
        };
    }

    // 非文本文件（如 PDF / 图片 / DOCX 等）交由系统默认应用安全打开
    const errMsg = await shell.openPath(resolvedPath);
    if (errMsg) {
        return { ok: false, error: `无法打开文件: ${errMsg}` };
    }
    return { ok: true, kind: 'external-file', filePath: resolvedPath };
});

// 复制文本到系统剪贴板
ipcMain.handle('copy-text', async (_event, text) => {
    try {
        clipboard.writeText(String(text || ''));
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// 定位随安装包附带的本机 AI（DSH）桥接插件目录（供新电脑快速配置）
function resolveDshBridgePluginDir() {
    const candidates = [
        path.join(process.resourcesPath || '', 'dsh-plugin'),
        path.join(__dirname, 'dsh-plugin')
    ];
    for (const dir of candidates) {
        if (dir && fs.existsSync(path.join(dir, 'package.json'))) {
            return dir;
        }
    }
    return null;
}

ipcMain.handle('reveal-ai-bridge-plugin', async () => {
    const dir = resolveDshBridgePluginDir();
    if (!dir) {
        return { success: false, error: '未找到内置桥接插件目录' };
    }
    shell.showItemInFolder(path.join(dir, 'package.json'));
    clipboard.writeText(dir);
    return { success: true, dir };
});

// 一键发送到本机 AI（默认 DeepSeek Harness：原子投递 + 剪贴板兜底 + 唤起窗口）
ipcMain.handle('send-to-dsh', async (_event, payload) => {
    const prompt = String(payload?.prompt || '').trim();
    if (!prompt) {
        return { success: false, error: '内容为空' };
    }

    const filePath = payload?.filePath || null;
    const cwd = payload?.cwd || (filePath ? path.dirname(filePath) : null);
    const id = `mditor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
        // 1. 同步写入剪贴板作为可靠兜底
        clipboard.writeText(prompt);

        // 2. 原子写入 ~/.mditor/dsh-inbox/*.json，由 DSH mditor-bridge 插件即时消费并填入新对话草稿
        const inboxDir = path.join(os.homedir(), '.mditor', 'dsh-inbox');
        fs.mkdirSync(inboxDir, { recursive: true });
        const tmpFile = path.join(inboxDir, `${id}.tmp`);
        const jsonFile = path.join(inboxDir, `${id}.json`);
        const data = {
            id,
            prompt,
            filePath,
            cwd,
            createdAt: Date.now()
        };
        fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
        fs.renameSync(tmpFile, jsonFile);

        // 3. 通过 dsh://open 唤起本机 DeepSeek Harness 窗口（macOS / Windows 原生支持）
        let opened = false;
        try {
            await shell.openExternal('dsh://open');
            opened = true;
        } catch {
            opened = false;
        }

        if (!opened && process.platform === 'darwin') {
            execFile('open', ['-a', 'DeepSeek Harness'], () => {});
            opened = true;
        }

        return { success: true, id, opened };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// 读取目录结构（用于文件树）
ipcMain.handle('read-directory', async (event, dirPath) => {
    try {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        return items
            .filter(item => !item.name.startsWith('.'))  // 隐藏文件
            .map(item => ({
                name: item.name,
                path: path.join(dirPath, item.name),
                isDirectory: item.isDirectory(),
                ext: item.isFile() ? path.extname(item.name).toLowerCase() : null
            }))
            .sort((a, b) => {
                // 文件夹在前，然后按名称排序
                if (a.isDirectory && !b.isDirectory) return -1;
                if (!a.isDirectory && b.isDirectory) return 1;
                return a.name.localeCompare(b.name);
            });
    } catch (e) {
        return [];
    }
});

// 重命名文件
ipcMain.handle('rename-file', async (event, { oldPath, newName }) => {
    try {
        const dir = path.dirname(oldPath);
        const newPath = path.join(dir, newName);

        // 检查新文件名是否已存在
        if (fs.existsSync(newPath) && newPath !== oldPath) {
            return { success: false, error: '文件名已存在' };
        }

        fs.renameSync(oldPath, newPath);

        // 更新窗口状态与文件监听
        const win = BrowserWindow.fromWebContents(event.sender);
        const state = windowStates.get(event.sender.id);
        if (state) {
            state.lastSelfWriteTime = Date.now();
            state.filePath = newPath;
        }
        watchWindowFile(win, newPath);

        return { success: true, filePath: newPath, fileName: newName };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// 在文件夹中显示
ipcMain.handle('show-in-folder', async (event, filePath) => {
    if (filePath && fs.existsSync(filePath)) {
        shell.showItemInFolder(filePath);
        return true;
    }
    return false;
});

// 读取文件内容（用于文件树点击打开）
ipcMain.handle('read-file', async (event, filePath) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const readRes = readTextFileSafe(filePath);
    if (!readRes.ok) {
        return { error: readRes.error };
    }
    const state = windowStates.get(event.sender.id);
    if (state) state.filePath = filePath;
    app.addRecentDocument(filePath);
    watchWindowFile(win, filePath);
    return {
        content: readRes.content,
        fileName: path.basename(filePath),
        filePath
    };
});

// 获取当前文件所在目录
ipcMain.handle('get-current-directory', async (event) => {
    const state = windowStates.get(event.sender.id);
    if (state?.filePath) {
        return path.dirname(state.filePath);
    }
    return null;
});

// 获取父目录
ipcMain.handle('get-parent-directory', async (event, dirPath) => {
    const parent = path.dirname(dirPath);
    // 检查是否到达根目录
    if (parent === dirPath) {
        return null;  // 已经是根目录
    }
    return parent;
});

// 窗口控制（最小化/最大化/关闭）
ipcMain.on('window-minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
});

ipcMain.on('window-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
        if (win.isMaximized()) {
            win.unmaximize();
        } else {
            win.maximize();
        }
    }
});

ipcMain.on('window-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.close();
});

// 检查窗口是否最大化
ipcMain.handle('is-maximized', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win?.isMaximized() || false;
});

// 获取主题
ipcMain.handle('get-theme', () => {
    return globalSettings.theme;
});

// 设置主题（并广播给所有窗口）
ipcMain.handle('set-theme', (event, theme) => {
    globalSettings.theme = theme;
    saveSettings(globalSettings);

    // 广播给所有窗口
    BrowserWindow.getAllWindows().forEach(win => {
        if (win.isDestroyed()) return;
        if (win.webContents.id !== event.sender.id) {
            win.webContents.send('theme-changed', theme);
        }
    });

    return true;
});

// 检查更新
ipcMain.handle('check-for-updates', async () => {
    try {
        const https = require('https');
        const currentVersion = require('./package.json').version;

        return new Promise((resolve) => {
            const options = {
                hostname: 'api.github.com',
                path: '/repos/lookingatyou250-byte/mditor/releases/latest',
                headers: { 'User-Agent': 'mditor' }
            };

            https.get(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const release = JSON.parse(data);
                        const latestVersion = release.tag_name?.replace('v', '') || '';
                        const hasUpdate = latestVersion && latestVersion !== currentVersion;
                        resolve({
                            hasUpdate,
                            version: latestVersion,
                            downloadUrl: release.html_url || 'https://github.com/lookingatyou250-byte/mditor/releases'
                        });
                    } catch {
                        resolve({ hasUpdate: false });
                    }
                });
            }).on('error', () => {
                resolve({ hasUpdate: false });
            });
        });
    } catch {
        return { hasUpdate: false };
    }
});

// ========== 原生菜单配置（macOS 原生菜单栏与系统快捷键支持） ==========
function sendMenuAction(action) {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
        win.webContents.send('menu-action', action);
    }
}

function setupApplicationMenu() {
    if (process.platform !== 'darwin') {
        Menu.setApplicationMenu(null);
        return;
    }

    const template = [
        {
            label: app.name,
            submenu: [
                { role: 'about', label: '关于 mditor' },
                { type: 'separator' },
                {
                    label: '设置...',
                    accelerator: 'CmdOrCtrl+,',
                    click: () => sendMenuAction('open-settings')
                },
                { type: 'separator' },
                { role: 'services', label: '服务' },
                { type: 'separator' },
                { role: 'hide', label: '隐藏 mditor' },
                { role: 'hideOthers', label: '隐藏其他' },
                { role: 'unhide', label: '全部显示' },
                { type: 'separator' },
                { role: 'quit', label: '退出 mditor' }
            ]
        },
        {
            label: '文件',
            submenu: [
                {
                    label: '新建文档',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => sendMenuAction('new-file')
                },
                {
                    label: '新建窗口',
                    accelerator: 'CmdOrCtrl+Shift+N',
                    click: () => createWindow()
                },
                { type: 'separator' },
                {
                    label: '打开文件...',
                    accelerator: 'CmdOrCtrl+O',
                    click: () => sendMenuAction('open-file')
                },
                {
                    label: '打开文件夹...',
                    accelerator: 'CmdOrCtrl+Shift+O',
                    click: () => sendMenuAction('open-folder')
                },
                {
                    label: '快速跳转文件...',
                    accelerator: 'CmdOrCtrl+P',
                    click: () => sendMenuAction('quick-open')
                },
                { type: 'separator' },
                {
                    label: '保存',
                    accelerator: 'CmdOrCtrl+S',
                    click: () => sendMenuAction('save')
                },
                {
                    label: '另存为...',
                    accelerator: 'CmdOrCtrl+Shift+S',
                    click: () => sendMenuAction('save-as')
                },
                {
                    label: '导出为 PDF...',
                    accelerator: 'CmdOrCtrl+Alt+E',
                    click: () => sendMenuAction('export-pdf')
                },
                { type: 'separator' },
                { role: 'close', label: '关闭窗口' }
            ]
        },
        {
            label: '编辑',
            submenu: [
                { role: 'undo', label: '撤销' },
                { role: 'redo', label: '重做' },
                { type: 'separator' },
                { role: 'cut', label: '剪切' },
                { role: 'copy', label: '复制' },
                { role: 'paste', label: '粘贴' },
                { role: 'selectAll', label: '全选' },
                { type: 'separator' },
                {
                    label: '页内查找...',
                    accelerator: 'CmdOrCtrl+F',
                    click: () => sendMenuAction('find')
                },
                {
                    label: '高亮选中内容',
                    accelerator: 'Ctrl+H',
                    click: () => sendMenuAction('highlight')
                },
                {
                    label: '引用选中文字发给 AI',
                    accelerator: 'CmdOrCtrl+L',
                    click: () => sendMenuAction('quote-to-ai')
                },
                {
                    label: '发送暂存引用发给 AI',
                    accelerator: 'CmdOrCtrl+Shift+L',
                    click: () => sendMenuAction('send-staged-ai')
                }
            ]
        },
        {
            label: '视图',
            submenu: [
                {
                    label: '切换阅读 / 编辑模式',
                    accelerator: 'CmdOrCtrl+E',
                    click: () => sendMenuAction('toggle-mode')
                },
                {
                    label: '切换侧边栏',
                    accelerator: 'CmdOrCtrl+\\',
                    click: () => sendMenuAction('toggle-sidebar')
                },
                {
                    label: '切换聚焦模式',
                    accelerator: 'CmdOrCtrl+Shift+F',
                    click: () => sendMenuAction('toggle-focus')
                },
                {
                    label: '切换亮色 / 暗色主题',
                    accelerator: 'CmdOrCtrl+Shift+D',
                    click: () => sendMenuAction('toggle-theme')
                },
                { type: 'separator' },
                {
                    label: '放大字号',
                    accelerator: 'CmdOrCtrl+Plus',
                    click: () => sendMenuAction('zoom-in')
                },
                {
                    label: '缩小字号',
                    accelerator: 'CmdOrCtrl+-',
                    click: () => sendMenuAction('zoom-out')
                },
                {
                    label: '实际字号',
                    accelerator: 'CmdOrCtrl+0',
                    click: () => sendMenuAction('zoom-reset')
                },
                { type: 'separator' },
                { role: 'togglefullscreen', label: '进入全屏' }
            ]
        },
        {
            label: '窗口',
            submenu: [
                { role: 'minimize', label: '最小化' },
                { role: 'zoom', label: '缩放' },
                { type: 'separator' },
                { role: 'front', label: '前置全部窗口' }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// ========== 应用生命周期 ==========
// 注意：这些只有在获取到单实例锁时才执行（由于前面的 if (!gotTheLock) 会 quit）
app.whenReady().then(() => {
    setupApplicationMenu();

    createWindow(launchFilePath);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
