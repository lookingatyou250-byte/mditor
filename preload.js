const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
    // 监听文件打开事件
    onFileOpened: (callback) => {
        ipcRenderer.on('file-opened', (event, data) => callback(data));
    },

    // 平台检测
    platform: process.platform,

    // 通知主进程渲染器已就绪
    sendAppReady: () => ipcRenderer.send('app-ready')
});
