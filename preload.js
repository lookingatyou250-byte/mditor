const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
    // ===== 文件操作 =====
    // 获取启动时打开的文件
    getInitialFile: () => ipcRenderer.invoke('get-initial-file'),

    // 打开文件对话框
    openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),

    // 打开文件夹对话框
    openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),

    // 导出为 PDF
    exportPdf: (defaultName) => ipcRenderer.invoke('export-pdf', defaultName),

    // 保存文件
    saveFile: (content, forceDialog) => ipcRenderer.invoke('save-file', { content, forceDialog }),

    // 读取文件
    readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),

    // 检查路径是文件还是文件夹
    statPath: (targetPath) => ipcRenderer.invoke('stat-path', targetPath),

    // 递归列出目录下的 Markdown 文件（用于 Cmd/Ctrl+P 快速跳转）
    listMarkdownFiles: (rootDir) => ipcRenderer.invoke('list-markdown-files', rootDir),

    // 同步当前窗口关联文件路径（拖拽/新建）
    setCurrentFile: (filePath) => ipcRenderer.invoke('set-current-file', filePath),

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

    // 原生菜单动作与全屏状态变化
    onMenuAction: (callback) => {
        ipcRenderer.on('menu-action', (_event, action) => callback(action));
    },

    onFullscreenChanged: (callback) => {
        ipcRenderer.on('fullscreen-changed', (_event, isFullscreen) => callback(isFullscreen));
    },

    // 平台检测
    platform: process.platform,

    // 打开外部链接
    openExternal: (url) => ipcRenderer.invoke('open-external', url),

    // 解析并打开本地链接（.md 在 mditor 内直接打开）
    openLocalLink: (payload) => ipcRenderer.invoke('open-local-link', payload),

    // 复制文本 & 一键发送到本机 AI & 定位/读取桥接插件信息
    copyText: (text) => ipcRenderer.invoke('copy-text', text),
    sendToDsh: (payload) => ipcRenderer.invoke('send-to-dsh', payload),
    getAiBridgeInfo: () => ipcRenderer.invoke('get-ai-bridge-info'),
    revealAiBridgePlugin: () => ipcRenderer.invoke('reveal-ai-bridge-plugin'),

    // 检查更新与版本
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),

    // 外部文件变动监听（Live Reload）
    onFileExternallyChanged: (callback) => {
        ipcRenderer.on('file-externally-changed', (_event, data) => callback(data));
    },

    // 主题管理
    getTheme: () => ipcRenderer.invoke('get-theme'),
    setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),
    onThemeChanged: (callback) => {
        ipcRenderer.on('theme-changed', (event, theme) => {
            callback(theme);
        });
    }
});
