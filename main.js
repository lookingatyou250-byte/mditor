const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// ========== 全局状态 ==========
let mainWindow = null;
let initialFilePath = null;  // 启动时要打开的文件

// ========== 立即捕获启动参数（在 app.whenReady 之前）==========
// Windows/Linux: 文件路径在 argv 中
if (process.platform !== 'darwin') {
    const args = process.argv.slice(1);
    initialFilePath = args.find(arg => !arg.startsWith('--') && !arg.startsWith('-') && fs.existsSync(arg));
}

// macOS: 文件路径通过 open-file 事件传递（可能在 ready 之前触发）
app.on('open-file', (event, filePath) => {
    event.preventDefault();
    initialFilePath = filePath;

    // 如果窗口已存在且加载完毕，直接发送
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        sendFileToRenderer(filePath);
    }
});

// ========== 单实例锁 ==========
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();

            // 从第二个实例的命令行中提取文件路径
            const args = commandLine.slice(1);
            const filePath = args.find(arg => !arg.startsWith('--') && !arg.startsWith('-'));
            if (filePath && fs.existsSync(filePath)) {
                sendFileToRenderer(filePath);
            }
        }
    });
}

// ========== 窗口创建 ==========
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        titleBarStyle: 'hiddenInset',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'assets/icon.png'),
        show: false
    });

    mainWindow.loadFile('index.html');
    mainWindow.once('ready-to-show', () => mainWindow.show());

    const menu = Menu.buildFromTemplate(getMenuTemplate());
    Menu.setApplicationMenu(menu);
}

// ========== IPC 处理 ==========
// 关键：Renderer 主动请求初始文件（拉取模式）
ipcMain.handle('get-initial-file', async () => {
    if (initialFilePath && fs.existsSync(initialFilePath)) {
        try {
            const content = fs.readFileSync(initialFilePath, 'utf-8');
            const result = {
                content,
                fileName: path.basename(initialFilePath),
                filePath: initialFilePath
            };
            app.addRecentDocument(initialFilePath);
            initialFilePath = null;  // 只消费一次
            return result;
        } catch (e) {
            console.error('Failed to read initial file:', e);
            return null;
        }
    }
    return null;
});

// ========== 发送文件到 Renderer ==========
function sendFileToRenderer(filePath) {
    if (!mainWindow || !filePath) return;

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        mainWindow.webContents.send('file-opened', {
            content,
            fileName: path.basename(filePath),
            filePath
        });
        app.addRecentDocument(filePath);
    } catch (e) {
        console.error('Failed to send file:', e);
    }
}

// ========== 菜单模板 ==========
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
                            sendFileToRenderer(result.filePaths[0]);
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

// ========== 应用生命周期 ==========
app.whenReady().then(() => {
    createWindow();

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
