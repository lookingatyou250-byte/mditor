const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// 保持窗口引用
let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        titleBarStyle: 'hiddenInset', // macOS 风格标题栏
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'assets/icon.png'),
        show: false // 等待 ready-to-show
    });

    mainWindow.loadFile('index.html');

    // 优雅显示
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // 设置菜单
    const menu = Menu.buildFromTemplate(getMenuTemplate());
    Menu.setApplicationMenu(menu);
}

// 菜单模板
function getMenuTemplate() {
    const isMac = process.platform === 'darwin';

    return [
        ...(isMac ? [{
            label: app.name,
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        }] : []),
        {
            label: '文件',
            submenu: [
                {
                    label: '打开...',
                    accelerator: 'CmdOrCtrl+O',
                    click: async () => {
                        const result = await dialog.showOpenDialog(mainWindow, {
                            properties: ['openFile'],
                            filters: [
                                { name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }
                            ]
                        });

                        if (!result.canceled && result.filePaths.length > 0) {
                            const filePath = result.filePaths[0];
                            const content = fs.readFileSync(filePath, 'utf-8');
                            mainWindow.webContents.send('file-opened', {
                                content,
                                fileName: path.basename(filePath),
                                filePath
                            });
                        }
                    }
                },
                { type: 'separator' },
                isMac ? { role: 'close' } : { role: 'quit' }
            ]
        },
        {
            label: '编辑',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' }
            ]
        },
        {
            label: '视图',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: '窗口',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                ...(isMac ? [
                    { type: 'separator' },
                    { role: 'front' }
                ] : [
                    { role: 'close' }
                ])
            ]
        }
    ];
}

// 诊断日志：同时尝试写到 userData 和 桌面 (如果可能)，并打印到控制台
function logToFile(msg) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${msg}\n`;
    console.log(logLine);

    try {
        const userDataPath = app.getPath('userData');
        if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });
        fs.appendFileSync(path.join(userDataPath, 'debug.log'), logLine);
    } catch (e) { console.error('Failed to write to userData log', e); }
}

// 全局错误捕获
process.on('uncaughtException', (error) => {
    logToFile(`CRITICAL: Uncaught Exception: ${error.stack}`);
    dialog.showErrorBox('Critical Error', error.message);
});

// 应用就绪
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    logToFile('Quit: Second instance detected.');
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        logToFile(`Event: second-instance. CMD: ${JSON.stringify(commandLine)}`);

        // 诊断弹窗：显示接收到的参数
        // dialog.showMessageBoxSync(null, { message: `Second Instance Args: ${JSON.stringify(commandLine)}` });

        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();

            // 简单粗暴的查找逻辑：找第一个看起来像文件的参数
            // 忽略第一个参数 (exe)
            const args = commandLine.slice(1);
            // 找任何不是以 -- 开头的参数，我们假设它是文件
            const filePath = args.find(arg => !arg.startsWith('--'));

            if (filePath) {
                logToFile(`Second instance file match: ${filePath}`);
                openFile(filePath);
            }
        }
    });

    app.whenReady().then(() => {
        logToFile(`App Ready. Platform: ${process.platform}. Argv: ${JSON.stringify(process.argv)}`);

        // 诊断弹窗：让用户看到到底收到了什么 (仅在非开发环境或有文件参数时)
        // const isDev = !app.isPackaged;
        // if (!isDev || process.argv.length > 1) {
        //    dialog.showMessageBoxSync(null, { title: 'Debug Info', message: `Startup Args:\n${JSON.stringify(process.argv, null, 2)}` });
        // }

        createWindow();

        if (process.platform !== 'darwin') {
            const args = process.argv.slice(1);
            // 极简逻辑：只要不是 flag 就是文件
            const filePath = args.find(arg => !arg.startsWith('--'));

            logToFile(`Startup file search result: ${filePath}`);

            if (filePath) {
                // 使用 once 确保只触发一次
                mainWindow.once('ready-to-show', () => {
                    logToFile(`Window ready, opening: ${filePath}`);
                    openFile(filePath);
                });
            }
        }

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            }
        });
    });
}

// 待打开的文件路径
let pendingFile = null;

// 监听渲染进程准备就绪
ipcMain.on('app-ready', () => {
    logToFile('Event: app-ready received');
    if (pendingFile) {
        logToFile(`Flushing pending file: ${pendingFile}`);
        sendFileToRenderer(pendingFile);
        pendingFile = null;
    }
});

// macOS: 监听打开文件事件
app.on('open-file', (event, path) => {
    event.preventDefault(); // 必须阻止默认行为
    logToFile(`Event: open-file. Path: ${path}`);

    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        openFile(path);
    } else {
        // 缓存路径，等待 app-ready 后处理
        app.once('ready', () => {
            // 再次检查 mainWindow 是否已创建（可能在 ready 中创建了）
            // 如果在 ready 中创建 window 是同步的，这里 mainWindow 应该有了
            // 但为了保险，我们使用 setTimeout 或者依赖 pendingFile 机制
            // 其实更好的做法是：这里调用 openFile，openFile 会处理 pendingFile 逻辑
            logToFile(`Delayed open-file handling for: ${path}`);
            openFile(path);
        });
    }
});

// 处理打开文件请求
function openFile(filePath) {
    if (!filePath) return;

    // 清理路径 (移除可能存在的包裹引号)
    const cleanPath = filePath.replace(/^"|"$/g, '').trim();
    if (!cleanPath) return;

    logToFile(`OpenFile called for: ${cleanPath}`);

    // 如果主窗口还没建好，或者正在加载，则暂存
    if (!mainWindow || (mainWindow.webContents && mainWindow.webContents.isLoading())) {
        logToFile(`Caching pending file: ${cleanPath}`);
        pendingFile = cleanPath;
        return;
    }

    // 窗口就绪，直接发送
    sendFileToRenderer(cleanPath);
}

function sendFileToRenderer(filePath) {
    logToFile(`Sending file to renderer: ${filePath}`);

    fs.readFile(filePath, 'utf-8', (err, content) => {
        if (err) {
            logToFile(`Read error: ${err.message}`);
            // 可以选择弹窗通知用户
            // dialog.showErrorBox('File Open Error', `Could not open file:\n${filePath}\n${err.message}`);
            return;
        }

        const absolutePath = path.resolve(filePath);
        mainWindow.webContents.send('file-opened', {
            content,
            fileName: path.basename(absolutePath),
            filePath: absolutePath
        });

        app.addRecentDocument(absolutePath);
    });
}

// 所有窗口关闭
app.on('window-all-closed', () => {
    logToFile('All windows closed');
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
