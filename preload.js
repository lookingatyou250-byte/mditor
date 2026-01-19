const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
    // ===== 文件操作 =====
    // 获取启动时打开的文件
    getInitialFile: () => ipcRenderer.invoke('get-initial-file'),

    // 打开文件对话框
    openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),

    // 保存文件
    saveFile: (content, forceDialog) => ipcRenderer.invoke('save-file', { content, forceDialog }),

    // 读取文件
    readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),

    // 重命名文件
    renameFile: (oldPath, newName) => ipcRenderer.invoke('rename-file', { oldPath, newName }),

    // 在文件夹中显示
    showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),

    // ===== 文件树 =====
    // 读取目录
    readDirectory: (dirPath) => ipcRenderer.invoke('read-directory', dirPath),

    // 获取当前文件所在目录
    getCurrentDirectory: () => ipcRenderer.invoke('get-current-directory'),

    // 获取父目录
    getParentDirectory: (dirPath) => ipcRenderer.invoke('get-parent-directory', dirPath),

    // ===== 窗口控制（无边框窗口） =====
    windowMinimize: () => ipcRenderer.send('window-minimize'),
    windowMaximize: () => ipcRenderer.send('window-maximize'),
    windowClose: () => ipcRenderer.send('window-close'),
    isMaximized: () => ipcRenderer.invoke('is-maximized'),

    // 新建窗口
    newWindow: () => ipcRenderer.send('new-window'),

    // ===== 事件监听 =====
    onFileOpened: (callback) => {
        ipcRenderer.on('file-opened', (event, data) => callback(data));
    },

    onNewFile: (callback) => {
        ipcRenderer.on('new-file', () => callback());
    },

    onRequestSave: (callback) => {
        ipcRenderer.on('request-save', () => callback(false));
    },

    onRequestSaveAs: (callback) => {
        ipcRenderer.on('request-save-as', () => callback(true));
    },

    // 平台检测
    platform: process.platform,

    // 打开外部链接
    openExternal: (url) => ipcRenderer.invoke('open-external', url),

    // 检查更新
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates')
});
