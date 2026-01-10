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

// 读取并发送文件内容到渲染进程
function openFile(filePath) {
    logToFile(`Opening file: ${filePath}`);
    if (!mainWindow || !filePath) {
        logToFile('Open aborted: mainWindow is null or filePath is empty');
        return;
    }

    // 如果路径包含引号，去除它 (Windows 有时会传递带引号的路径)
    let cleanPath = filePath.replace(/"/g, '');

    fs.readFile(cleanPath, 'utf-8', (err, content) => {
        if (err) {
            logToFile(`Error reading file: ${err.message}`);
            console.error('Failed to open file:', err);
            return;
        }

        // 确保文件路径是绝对路径
        const absolutePath = path.resolve(cleanPath);
        logToFile(`File read success. Sending to renderer. Path: ${absolutePath}`);

        // 增加一个延时确保渲染进程完全加载了 preload 脚本和事件监听
        // 有时候 ready-to-show 触发时，React/Vue/VanillaJS 可能还没执行到监听代码
        setTimeout(() => {
            mainWindow.webContents.send('file-opened', {
                content,
                fileName: path.basename(absolutePath),
                filePath: absolutePath
            });
        }, 500);


        // 将文件添加到最近打开文档记录 (OS层级)
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
