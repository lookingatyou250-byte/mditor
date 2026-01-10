const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
    // 监听文件打开事件（用于菜单打开、拖拽等）
    onFileOpened: (callback) => {
        ipcRenderer.on('file-opened', (event, data) => callback(data));
    },

    // 主动获取启动时打开的文件（拉取模式）
    getInitialFile: () => ipcRenderer.invoke('get-initial-file'),

    // 保存文件
    saveFile: (content, forceDialog) => ipcRenderer.invoke('save-file', { content, forceDialog }),

    // 监听新建文件请求
    onNewFile: (callback) => {
        ipcRenderer.on('new-file', () => callback());
    },

    // 监听保存请求（来自菜单）
    onRequestSave: (callback) => {
        ipcRenderer.on('request-save', () => callback(false));
    },

    // 监听另存为请求
    onRequestSaveAs: (callback) => {
        ipcRenderer.on('request-save-as', () => callback(true));
    },

    // 平台检测
    platform: process.platform
});
