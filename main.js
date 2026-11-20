const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// ========== 单实例模式 ==========
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    // 已经有一个实例在运行，立即退出
    app.exit(0);
}

// 监听第二个实例的启动（只有获得锁的实例会到达这里）
app.on('second-instance', (event, commandLine, workingDirectory) => {
    // 从命令行参数中提取文件路径
    const args = commandLine.slice(1);
    let filePath = null;
    for (const arg of args) {
        const cleaned = arg.replace(/^"|"$/g, '').trim();
        if (!cleaned || cleaned.startsWith('--') || cleaned.startsWith('-')) continue;
        try {
            const normalizedPath = path.normalize(cleaned);
            const stat = fs.statSync(normalizedPath);
            if (stat.isFile()) {
                filePath = normalizedPath;
                break;
            }
        } catch {
            continue;
        }
    }
    // 创建新窗口
    createWindow(filePath);
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
if (process.platform !== 'darwin') {
    const args = process.argv.slice(1);
    for (const arg of args) {
        const cleaned = arg.replace(/^"|"$/g, '').trim();
        // 跳过空参数或命令行选项
        if (!cleaned || cleaned.startsWith('--') || cleaned.startsWith('-')) continue;
        try {
            // 规范化路径
            const normalizedPath = path.normalize(cleaned);
            const stat = fs.statSync(normalizedPath);
            if (stat.isFile()) {
                launchFilePath = normalizedPath;
                break;
            }
        } catch {
            // 文件不存在或无法访问，继续检查下一个参数
            continue;
        }
    }
}

// macOS: open-file 事件
app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (app.isReady()) {
        createWindow(filePath);
    } else {
        launchFilePath = filePath;
    }
});

// ========== 窗口创建 ==========
function createWindow(filePathToOpen = null) {
    const win = new BrowserWindow({
        width: 1000,
        height: 700,
        minWidth: 600,
        minHeight: 400,
        frame: false,  // 无边框窗口
        titleBarStyle: 'hidden',
        trafficLightPosition: { x: 12, y: 12 },  // macOS 红绿灯位置
        backgroundColor: globalSettings.theme === 'dark' ? '#262624' : '#FAF9F5',  // 匹配当前主题防止启动闪烁
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

    // 拦截外部链接，统一用系统默认浏览器打开，防止弹出空白 Electron 窗口
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    win.webContents.on('will-navigate', (event, url) => {
        if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
            event.preventDefault();
            shell.openExternal(url);
        }
    });

    win.loadFile('index.html');

    win.once('ready-to-show', () => {
        win.show();
    });

    // 保存 ID 用于清理（因为 closed 事件时 webContents 已销毁）
    const webContentsId = win.webContents.id;

    // 窗口即将关闭时询问是否保存高亮或未保存内容
    win.on('close', async (e) => {
        e.preventDefault();  // 先阻止关闭

        try {
            // 询问渲染进程是否可以关闭
            const canClose = await win.webContents.executeJavaScript('window.app?._handleWindowClose()');
            if (canClose) {
                win.destroy();  // 如果允许关闭，直接销毁窗口
            }
        } catch (error) {
            console.error('检查关闭条件失败:', error);
            win.destroy();  // 出错时直接关闭
        }
    });

    // 窗口关闭时清理状态和文件监听
    win.on('closed', () => {
        clearWindowWatcher(windowStates.get(webContentsId));
        windowStates.delete(webContentsId);
    });

    // 隐藏菜单栏（Windows/Linux）
    win.setMenuBarVisibility(false);
    win.setAutoHideMenuBar(true);

    return win;
}

// ========== IPC 处理 ==========
// Renderer 拉取初始文件
ipcMain.handle('get-initial-file', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const state = windowStates.get(event.sender.id);
    if (state && state.pendingFile && fs.existsSync(state.pendingFile)) {
        try {
            const content = fs.readFileSync(state.pendingFile, 'utf-8');
            const result = {
                content,
                fileName: path.basename(state.pendingFile),
                filePath: state.pendingFile
            };
            state.filePath = state.pendingFile;
            state.pendingFile = null;  // 消费一次
            app.addRecentDocument(state.filePath);
            watchWindowFile(win, state.filePath);
            return result;
        } catch (e) {
            console.error('Failed to read initial file:', e);
            return null;
        }
    }
    return null;
});

// 打开文件对话框
ipcMain.handle('open-file-dialog', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [
            { name: 'Markdown', extensions: ['md', 'markdown', 'txt', 'mkd', 'mdx'] }
        ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        const state = windowStates.get(event.sender.id);
        if (state) state.filePath = filePath;

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            app.addRecentDocument(filePath);
            watchWindowFile(win, filePath);
            return {
                content,
                fileName: path.basename(filePath),
                filePath
            };
        } catch (e) {
            return { error: e.message };
        }
    }
    return null;
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
    if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
        await shell.openExternal(url);
        return true;
    }
    return false;
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
    try {
        const win = BrowserWindow.fromWebContents(event.sender);
        const content = fs.readFileSync(filePath, 'utf-8');
        const state = windowStates.get(event.sender.id);
        if (state) state.filePath = filePath;
        app.addRecentDocument(filePath);
        watchWindowFile(win, filePath);
        return {
            content,
            fileName: path.basename(filePath),
            filePath
        };
    } catch (e) {
        return { error: e.message };
    }
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

// ========== 应用生命周期 ==========
// 注意：这些只有在获取到单实例锁时才执行（由于前面的 if (!gotTheLock) 会 quit）
app.whenReady().then(() => {
    // 隐藏默认菜单（但保留快捷键功能）
    Menu.setApplicationMenu(null);

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
