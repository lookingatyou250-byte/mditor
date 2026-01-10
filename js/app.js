/**
 * App - 应用入口
 * 初始化所有模块，协调工作
 */
class App {
    constructor() {
        // 核心模块
        this.eventBus = eventBus;
        this.state = new StateManager(this.eventBus);

        // 功能模块
        this.parser = new MarkdownParser(this.eventBus, this.state);
        this.renderer = new Renderer(this.eventBus, this.state);
        this.outline = new Outline(this.eventBus, this.state);
        this.fileHandler = new FileHandler(this.eventBus, this.state);

        // DOM 元素缓存
        this.elements = {};
    }

    /**
     * 初始化应用
     */
    init() {
        this._cacheElements();
        this._initModules();
        this._bindEvents();
        this._applyTheme();
        this._loadDemo();

        console.log('📝 Markdown Reader initialized');
    }

    /**
     * 缓存 DOM 元素
     */
    _cacheElements() {
        this.elements = {
            app: document.getElementById('app'),
            content: document.getElementById('content'),
            outline: document.getElementById('outline'),
            sidebar: document.getElementById('sidebar'),
            toolbar: document.getElementById('toolbar'),
            fileInput: document.getElementById('file-input'),
            fileName: document.getElementById('file-name'),
            themeBtn: document.getElementById('theme-toggle'),
            sidebarBtn: document.getElementById('sidebar-toggle'),
            focusBtn: document.getElementById('focus-toggle'),
            typewriterBtn: document.getElementById('typewriter-toggle'),
            openBtn: document.getElementById('open-file')
        };
    }

    /**
     * 初始化模块
     */
    _initModules() {
        this.renderer.init(this.elements.content);
        this.outline.init(this.elements.outline);
        this.fileHandler.init(this.elements.app, this.elements.fileInput);
    }

    /**
     * 绑定事件
     */
    _bindEvents() {
        // 文件加载事件
        this.eventBus.on(Events.FILE_LOADED, ({ content, fileName }) => {
            this._onFileLoaded(content, fileName);
        });

        // 文件错误事件
        this.eventBus.on(Events.FILE_ERROR, ({ message }) => {
            this._showToast(message, 'error');
        });

        // 大纲导航事件
        this.eventBus.on(Events.OUTLINE_NAVIGATE, (headingId) => {
            this.renderer.scrollToHeading(headingId);
        });

        // 工具栏按钮
        this._bindToolbarEvents();

        // 键盘快捷键
        this._bindKeyboardShortcuts();
    }

    /**
     * 绑定工具栏事件
     */
    _bindToolbarEvents() {
        // 打开文件
        this.elements.openBtn?.addEventListener('click', () => {
            this.fileHandler.openFilePicker();
        });

        // 主题切换
        this.elements.themeBtn?.addEventListener('click', () => {
            this._toggleTheme();
        });

        // 侧边栏切换
        this.elements.sidebarBtn?.addEventListener('click', () => {
            this._toggleSidebar();
        });

        // Focus Mode
        this.elements.focusBtn?.addEventListener('click', () => {
            this._toggleFocusMode();
        });

        // Typewriter Mode
        this.elements.typewriterBtn?.addEventListener('click', () => {
            this._toggleTypewriterMode();
        });
    }

    /**
     * 绑定键盘快捷键
     */
    _bindKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+\ 切换侧边栏
            if (e.ctrlKey && e.key === '\\') {
                e.preventDefault();
                this._toggleSidebar();
            }

            // Ctrl+Shift+F 切换 Focus Mode
            if (e.ctrlKey && e.shiftKey && e.key === 'F') {
                e.preventDefault();
                this._toggleFocusMode();
            }

            // Ctrl+Shift+T 切换 Typewriter Mode
            if (e.ctrlKey && e.shiftKey && e.key === 'T') {
                e.preventDefault();
                this._toggleTypewriterMode();
            }
        });
    }

    /**
     * 文件加载处理
     */
    _onFileLoaded(content, fileName) {
        // 更新文件名显示
        if (this.elements.fileName) {
            this.elements.fileName.textContent = fileName;
        }

        // 解析 Markdown
        const html = this.parser.parse(content);
        const outline = this.parser.extractOutline(content);

        // 更新状态
        this.state.batch({
            'document.html': html,
            'document.outline': outline
        });

        // 发布事件
        this.eventBus.emit(Events.CONTENT_PARSED, { html, outline });
        this.eventBus.emit(Events.OUTLINE_UPDATED, outline);

        this._showToast(`已加载: ${fileName}`, 'success');
    }

    /**
     * 切换主题
     */
    _toggleTheme() {
        const current = this.state.get('ui.theme');
        const next = current === 'light' ? 'dark' : 'light';

        this.state.set('ui.theme', next);
        this.state.persistTheme();
        this._applyTheme();

        this.eventBus.emit(Events.THEME_CHANGED, next);
    }

    /**
     * 应用主题
     */
    _applyTheme() {
        const theme = this.state.get('ui.theme');
        document.documentElement.setAttribute('data-theme', theme);

        // 更新按钮图标
        if (this.elements.themeBtn) {
            this.elements.themeBtn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
            this.elements.themeBtn.title = theme === 'dark' ? '切换到亮色' : '切换到暗色';
        }
    }

    /**
     * 切换侧边栏
     */
    _toggleSidebar() {
        const visible = !this.state.get('ui.sidebarVisible');
        this.state.set('ui.sidebarVisible', visible);

        this.elements.sidebar?.classList.toggle('collapsed', !visible);
        this.elements.sidebarBtn?.classList.toggle('active', visible);

        this.eventBus.emit(Events.SIDEBAR_TOGGLE, visible);
    }

    /**
     * 切换 Focus Mode
     */
    _toggleFocusMode() {
        const enabled = !this.state.get('ui.focusMode');
        this.state.set('ui.focusMode', enabled);

        this.elements.focusBtn?.classList.toggle('active', enabled);
        this.eventBus.emit(Events.FOCUS_MODE_TOGGLE, enabled);

        this._showToast(enabled ? 'Focus Mode 开启' : 'Focus Mode 关闭', 'info');
    }

    /**
     * 切换 Typewriter Mode
     */
    _toggleTypewriterMode() {
        const enabled = !this.state.get('ui.typewriterMode');
        this.state.set('ui.typewriterMode', enabled);

        this.elements.typewriterBtn?.classList.toggle('active', enabled);
        this.elements.content?.classList.toggle('typewriter-mode', enabled);

        this.eventBus.emit(Events.TYPEWRITER_MODE_TOGGLE, enabled);

        this._showToast(enabled ? 'Typewriter Mode 开启' : 'Typewriter Mode 关闭', 'info');
    }

    /**
     * 显示 Toast 提示
     */
    _showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        document.body.appendChild(toast);

        // 触发动画
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // 自动移除
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }

    /**
     * 加载演示内容
     */
    _loadDemo() {
        const demoContent = `# 欢迎使用 Markdown 阅读器

这是一个类似 **Typora** 的精美 Markdown 阅读器。

## ✨ 特性

- 🎨 **优雅界面** - 极简设计，专注阅读
- 🌓 **主题切换** - 支持亮色/暗色模式
- 📑 **大纲导航** - 侧边栏目录快速跳转
- 🎯 **Focus Mode** - 高亮当前段落
- 📁 **拖拽加载** - 拖入 .md 文件即可阅读

## 🚀 开始使用

1. 拖拽一个 \`.md\` 文件到页面
2. 或点击工具栏的 **打开** 按钮选择文件
3. 使用 \`Ctrl+O\` 快速打开

## ⌨️ 快捷键

| 快捷键 | 功能 |
|--------|------|
| \`Ctrl+O\` | 打开文件 |
| \`Ctrl+\\\` | 切换侧边栏 |
| \`Ctrl+Shift+F\` | Focus Mode |
| \`Ctrl+Shift+T\` | Typewriter Mode |

## 💻 代码示例

\`\`\`javascript
// 事件驱动架构
eventBus.on('file:loaded', (content) => {
  const html = parser.parse(content);
  renderer.render(html);
});
\`\`\`

## 📝 Todo

- [x] Markdown 渲染
- [x] 主题切换
- [x] 大纲导航
- [ ] 编辑功能 (P1)

---

> 💡 **提示**: 试试点击右上角的主题按钮切换暗色模式！
`;

        this.eventBus.emit(Events.FILE_LOADED, {
            content: demoContent,
            fileName: '欢迎.md'
        });
    }
}

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
    window.app.init();
});
