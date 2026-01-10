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

const logPath = path.join(app.getPath('userData'), 'debug.log');
function logToFile(msg) {
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
}

// 应用就绪
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    logToFile('Quit: Second instance detected during startup lock request.');
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        logToFile(`Event: second-instance. CMD: ${JSON.stringify(commandLine)}`);
        // 当运行第二个实例时，聚焦到主窗口
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();

            // Windows/Linux: 从命令行参数处理文件
            // 过滤掉第一个参数（通常是可执行文件路径）和可能的开关
            const args = commandLine.slice(1);
            const filePath = args.find(arg => !arg.startsWith('--') && (arg.toLowerCase().endsWith('.md') || arg.toLowerCase().endsWith('.markdown') || arg.toLowerCase().endsWith('.txt')));

            logToFile(`Second instance file path found: ${filePath}`);

            if (filePath) {
                openFile(filePath);
            }
        }
    });

    app.whenReady().then(() => {
        logToFile(`App Ready. Platform: ${process.platform}. Argv: ${JSON.stringify(process.argv)}`);
        createWindow();

        // Windows/Linux: 启动时检查是否有文件参数
        if (process.platform !== 'darwin') {
            // 过滤 argv，通常 argv[0] 是 exe 路径
            const args = process.argv.slice(1);
            const filePath = args.find(arg => !arg.startsWith('--') && (arg.toLowerCase().endsWith('.md') || arg.toLowerCase().endsWith('.markdown') || arg.toLowerCase().endsWith('.txt')));

            logToFile(`Startup file path found: ${filePath}`);

            if (filePath) {
                // 等待窗口加载完成后发送文件内容
                mainWindow.once('ready-to-show', () => {
                    logToFile(`Window ready-to-show, opening file: ${filePath}`);
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

// macOS: 监听打开文件事件
app.on('open-file', (event, path) => {
    logToFile(`Event: open-file. Path: ${path}`);
    event.preventDefault();
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        openFile(path);
    } else {
        // 如果窗口还未创建（冷启动），等到 ready 后再处理
        app.once('ready', () => {
            // 需要等待窗口创建
            setTimeout(() => {
                logToFile(`Delayed open-file: ${path}`);
                if (mainWindow) openFile(path);
            }, 500);
        });
    }
});

// 待打开的文件路径
let pendingFile = null;

// 监听渲染进程准备就绪
ipcMain.on('app-ready', () => {
    logToFile('Event: app-ready received from renderer');
    if (pendingFile) {
        logToFile(`Checking pending file: ${pendingFile}`);
        sendFileToRenderer(pendingFile);
        pendingFile = null; // 清空等待队列
    }
});

// 读取并发送文件内容到渲染进程
function openFile(filePath) {
    logToFile(`Processing openFile request: ${filePath}`);

    // 如果没有窗口，或者文件路径为空，暂存路径等待窗口/应用就绪
    if (!filePath) return;

    // 暂存路径
    pendingFile = filePath;

    if (!mainWindow) {
        logToFile('MainWindow not created yet, file cached in pendingFile');
        return;
    }

    // 尝试读取，但不再直接发送，而是更新 pendingFile
    // 实际发送逻辑由 app-ready 触发，或者如果窗口已经加载完毕直接发送（双击文件时应用已运行的情况）
    // 为了简化逻辑：我们只在 mainWindow.webContents 加载完成后发送

    // 如果是二次打开（应用已运行），渲染进程肯定已经 ready 了，可以直接发
    if (mainWindow.webContents && !mainWindow.webContents.isLoading()) {
        logToFile('Window is loaded, sending file immediately');
        sendFileToRenderer(filePath);
        pendingFile = null;
    } else {
        logToFile('Window is loading, waiting for app-ready');
    }
}

function sendFileToRenderer(filePath) {
    // 如果路径包含引号，去除它
    let cleanPath = filePath.replace(/"/g, '');

    fs.readFile(cleanPath, 'utf-8', (err, content) => {
        if (err) {
            logToFile(`Error reading file: ${err.message}`);
            return;
        }

        const absolutePath = path.resolve(cleanPath);
        logToFile(`Sending file content: ${absolutePath}`);

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
