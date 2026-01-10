const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
    // 监听文件打开事件（用于菜单打开、拖拽等）
    onFileOpened: (callback) => {
        ipcRenderer.on('file-opened', (event, data) => callback(data));
    },

    // 主动获取启动时打开的文件（拉取模式）
    getInitialFile: () => ipcRenderer.invoke('get-initial-file'),

    // 平台检测
    platform: process.platform
});
