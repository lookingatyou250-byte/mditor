/**
 * mditor v2.0 - 极简 Markdown 编辑器
 * 主应用入口
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

        // 编辑器实例
        this.editor = null;
        this.isEditMode = false;
        this.currentContent = '';
        this.currentFilePath = null;
        this.hasUnsavedChanges = false;

        // 侧边栏状态: 'hidden' | 'outline' | 'filetree'
        this.sidebarMode = 'hidden';  // 默认隐藏，最大化写作区域

        // 文件树根目录
        this.filetreeRoot = null;

        // 自动保存定时器
        this.autoSaveTimer = null;

        // 斜杠命令
        this.slashMenuVisible = false;
        this.slashMenuIndex = 0;
        this.slashCommandsInitialized = false;
        this.slashTriggerPos = null;  // 保存 // 的位置
        this.slashCommands = [
            { icon: 'H1', label: '标题 1', hint: '# ', text: '# ' },
            { icon: 'H2', label: '标题 2', hint: '## ', text: '## ' },
            { icon: 'H3', label: '标题 3', hint: '### ', text: '### ' },
            { icon: 'B', label: '粗体', hint: '**文本**', text: '**文本**', selectFrom: 2, selectTo: 4 },
            { icon: 'I', label: '斜体', hint: '*文本*', text: '*文本*', selectFrom: 1, selectTo: 3 },
            { icon: '`', label: '代码', hint: '`代码`', text: '`代码`', selectFrom: 1, selectTo: 3 },
            { icon: '```', label: '代码块', hint: '```', text: '```\n\n```', cursorOffset: -4 },
            { icon: '>', label: '引用', hint: '> ', text: '> ' },
            { icon: '•', label: '列表', hint: '- ', text: '- ' },
            { icon: '1.', label: '有序列表', hint: '1. ', text: '1. ' },
            { icon: '☑', label: '任务', hint: '- [ ] ', text: '- [ ] ' },
            { icon: '🔗', label: '链接', hint: '[文本](url)', text: '[](url)', cursorOffset: -6 },
            { icon: '🖼', label: '图片', hint: '![](url)', text: '![](url)', cursorOffset: -6 },
            { icon: '—', label: '分割线', hint: '---', text: '\n---\n' },
        ];

        // DOM 元素缓存
        this.elements = {};
    }

    /**
     * 初始化应用
     */
    init() {
        this._detectPlatform();
        this._cacheElements();
        this._initModules();
        this._bindEvents();
        this._applyTheme();
        this._applySidebarMode();  // 应用默认侧边栏状态（隐藏）
        this._initScrollbar();     // 初始化自定义滚动条
        this._checkInitialFile();

        console.log('📝 mditor v2.9.9 initialized');
    }

    /**
     * 初始化自定义滚动条
     */
    _initScrollbar() {
        if (window.Scrollbar) {
            Scrollbar.initContentScrollbar();
        }
    }

    /**
     * 检测平台
     */
    _detectPlatform() {
        const platform = window.electronAPI?.platform || 'web';
        document.body.classList.add(`platform-${platform}`);
    }

    /**
     * 缓存 DOM 元素
     */
    _cacheElements() {
        this.elements = {
            app: document.getElementById('app'),
            content: document.getElementById('content'),
            sidebar: document.getElementById('sidebar'),
            outline: document.getElementById('outline'),
            filetree: document.getElementById('filetree'),
            fileInput: document.getElementById('file-input'),

            // 标题栏
            fileName: document.getElementById('file-name'),
            saveIndicator: document.getElementById('save-indicator'),
            themeBtn: document.getElementById('theme-toggle'),
            sidebarBtn: document.getElementById('sidebar-toggle'),
            modeToggleBtn: document.getElementById('mode-toggle'),
            focusBtn: document.getElementById('focus-toggle'),
            newFileBtn: document.getElementById('new-file-btn'),

            // 窗口控制
            winMinimize: document.getElementById('win-minimize'),
            winMaximize: document.getElementById('win-maximize'),
            winClose: document.getElementById('win-close'),

            // 侧边栏标签
            sidebarTabs: document.querySelectorAll('.sidebar-tab'),
            outlinePanel: document.getElementById('outline-panel'),
            filetreePanel: document.getElementById('filetree-panel'),

            // 编辑器
            editorContainer: document.getElementById('editor'),

            // 状态栏
            wordCount: document.getElementById('word-count'),
            currentMode: document.getElementById('current-mode'),

            // 斜杠菜单
            slashMenu: document.getElementById('slash-menu'),
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
        // 文件事件
        this.eventBus.on(Events.FILE_LOADED, ({ content, fileName }) => {
            this._onFileLoaded(content, fileName);
        });

        this.eventBus.on(Events.FILE_ERROR, ({ message }) => {
            this._showToast(message, 'error');
        });

        this.eventBus.on(Events.OUTLINE_NAVIGATE, (headingId) => {
            this.renderer.scrollToHeading(headingId);
        });

        // 按钮事件
        this._bindTitlebarEvents();
        this._bindKeyboardShortcuts();
        this._bindWindowControls();
        this._bindSidebarTabs();
    }

    /**
     * 绑定标题栏事件
     */
    _bindTitlebarEvents() {
        // 主题切换
        this.elements.themeBtn?.addEventListener('click', () => {
            this._toggleTheme();
        });

        // 侧边栏切换
        this.elements.sidebarBtn?.addEventListener('click', () => {
            this._cycleSidebarMode();
        });

        // 模式切换
        this.elements.modeToggleBtn?.addEventListener('click', () => {
            this._setMode(this.isEditMode ? 'read' : 'edit');
        });

        // 新建文件
        this.elements.newFileBtn?.addEventListener('click', () => {
            this._newFile();
        });

        // 点击文件名：新文件触发保存，已保存文件显示路径
        this.elements.fileName?.addEventListener('click', () => {
            this._onFileNameClick();
        });

        // 聚焦模式切换
        this.elements.focusBtn?.addEventListener('click', () => {
            this._toggleFocusMode();
        });
    }

    /**
     * 切换聚焦模式
     */
    _toggleFocusMode() {
        const current = this.state.get('ui.focusMode');
        const next = !current;

        this.state.set('ui.focusMode', next);
        this.eventBus.emit(Events.FOCUS_MODE_TOGGLE, next);

        // 更新按钮状态
        this.elements.focusBtn?.classList.toggle('active', next);

        this._showToast(next ? '聚焦模式已开启' : '聚焦模式已关闭', 'info');
    }

    /**
     * 文件名点击处理
     */
    _onFileNameClick() {
        if (!this.currentFilePath) {
            // 新文件：触发另存为
            this._saveFile(true);
        } else {
            // 已保存文件：显示完整路径提示
            this._showToast(this.currentFilePath, 'info');
        }
    }

    /**
     * 绑定窗口控制（无边框窗口）
     */
    _bindWindowControls() {
        if (!window.electronAPI) return;

        this.elements.winMinimize?.addEventListener('click', () => {
            window.electronAPI.windowMinimize();
        });

        this.elements.winMaximize?.addEventListener('click', () => {
            window.electronAPI.windowMaximize();
        });

        this.elements.winClose?.addEventListener('click', () => {
            window.electronAPI.windowClose();
        });
    }

    /**
     * 绑定侧边栏标签切换
     */
    _bindSidebarTabs() {
        this.elements.sidebarTabs?.forEach(tab => {
            tab.addEventListener('click', () => {
                const panel = tab.dataset.panel;
                this._setSidebarPanel(panel);
            });
        });
    }

    /**
     * 绑定键盘快捷键
     */
    _bindKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+\ 循环侧边栏模式
            if (e.ctrlKey && e.key === '\\') {
                e.preventDefault();
                this._cycleSidebarMode();
            }

            // Ctrl+E 切换模式
            if (e.ctrlKey && !e.shiftKey && e.key === 'e') {
                e.preventDefault();
                this._setMode(this.isEditMode ? 'read' : 'edit');
            }

            // Ctrl+N 新建空白文档
            if (e.ctrlKey && e.key === 'n') {
                e.preventDefault();
                this._newFile();
            }

            // Ctrl+O 打开
            if (e.ctrlKey && e.key === 'o') {
                e.preventDefault();
                this._openFile();
            }

            // Ctrl+S 保存
            if (e.ctrlKey && !e.shiftKey && e.key === 's') {
                e.preventDefault();
                this._saveFile(false);
            }

            // Ctrl+Shift+S 另存为
            if (e.ctrlKey && e.shiftKey && e.key === 'S') {
                e.preventDefault();
                this._saveFile(true);
            }
        });
    }

    /**
     * 检查启动时打开的文件
     */
    async _checkInitialFile() {
        if (window.electronAPI?.getInitialFile) {
            try {
                const data = await window.electronAPI.getInitialFile();
                if (data && data.content) {
                    this.currentFilePath = data.filePath;
                    this._onFileLoaded(data.content, data.fileName);
                    this._loadFileTree();
                    return;
                }
            } catch (e) {
                console.error('Failed to get initial file:', e);
            }
        }
        // 无初始文件，显示欢迎页
        this._loadDemo();
    }

    /**
     * 文件加载处理
     */
    _onFileLoaded(content, fileName) {
        this.currentContent = content;
        this.hasUnsavedChanges = false;

        // 更新文件名
        if (this.elements.fileName) {
            this.elements.fileName.textContent = fileName;
        }

        this._updateSaveIndicator();
        this._updateWordCount(content);

        // 解析并渲染
        const html = this.parser.parse(content);
        const outline = this.parser.extractOutline(content);

        this.eventBus.emit(Events.CONTENT_PARSED, { html, outline });
        this.eventBus.emit(Events.OUTLINE_UPDATED, outline);

        // 同步编辑器
        if (this.editor && this.isEditMode) {
            this.editor.setValue(content);
        }

        this._showToast(`已加载: ${fileName}`, 'success');
    }

    /**
     * 打开文件
     */
    async _openFile() {
        if (window.electronAPI?.openFileDialog) {
            const result = await window.electronAPI.openFileDialog();
            if (result && result.content) {
                this.currentFilePath = result.filePath;
                this._onFileLoaded(result.content, result.fileName);
                this._loadFileTree();
            }
        } else {
            this.fileHandler.openFilePicker();
        }
    }

    /**
     * 新建文件
     */
    _newFile() {
        this.currentContent = '';
        this.currentFilePath = null;

        if (this.elements.fileName) {
            this.elements.fileName.textContent = '未命名';
        }

        this.renderer.clear?.();
        this.outline.clear?.();

        if (this.editor) {
            this.editor.setValue('');
        }

        this._setMode('edit');
        this.hasUnsavedChanges = true;
        this._updateSaveIndicator();
        this._updateWordCount('');
    }

    /**
     * 保存文件
     */
    async _saveFile(forceDialog = false) {
        if (!window.electronAPI?.saveFile) {
            this._showToast('保存功能仅在桌面应用中可用', 'error');
            return;
        }

        const content = this.editor ? this.editor.getValue() : this.currentContent;

        try {
            const result = await window.electronAPI.saveFile(content, forceDialog);

            if (result.success) {
                this.currentFilePath = result.filePath;
                this.hasUnsavedChanges = false;

                if (this.elements.fileName) {
                    this.elements.fileName.textContent = result.fileName;
                }

                this._updateSaveIndicator();
                this._showToast(`已保存: ${result.fileName}`, 'success');
                this._loadFileTree();
            } else if (result.error) {
                this._showToast(`保存失败: ${result.error}`, 'error');
            }
        } catch (e) {
            this._showToast('保存时发生错误', 'error');
        }
    }

    /**
     * 加载文件树
     * @param {string} rootPath - 可选，指定根目录。不传则使用当前文件所在目录
     */
    async _loadFileTree(rootPath = null) {
        if (!window.electronAPI?.readDirectory) return;

        // 确定根目录
        if (rootPath) {
            this.filetreeRoot = rootPath;
        } else if (!this.filetreeRoot && this.currentFilePath) {
            // 使用当前文件所在目录
            const dir = await window.electronAPI.getCurrentDirectory();
            this.filetreeRoot = dir;
        }

        if (!this.filetreeRoot) {
            this.elements.filetree.innerHTML = '<div class="filetree-empty">打开文件后显示目录</div>';
            return;
        }

        // 渲染文件树
        this._renderFileTreeRoot();
    }

    /**
     * 渲染文件树根部（包含目录头和返回上级按钮）
     */
    async _renderFileTreeRoot() {
        const container = this.elements.filetree;
        container.innerHTML = '';

        // 目录头
        const header = document.createElement('div');
        header.className = 'filetree-header';

        // 获取目录名
        const dirName = this.filetreeRoot.split(/[/\\]/).pop() || this.filetreeRoot;

        header.innerHTML = `
            <button class="filetree-up-btn" title="返回上一级">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 14l-4-4 4-4"/>
                    <path d="M5 10h11a4 4 0 110 8h-1"/>
                </svg>
            </button>
            <span class="filetree-dirname" title="${this.filetreeRoot}">${dirName}</span>
        `;

        // 返回上级按钮事件
        header.querySelector('.filetree-up-btn').addEventListener('click', async () => {
            const parent = await window.electronAPI.getParentDirectory(this.filetreeRoot);
            if (parent && parent !== this.filetreeRoot) {
                this._loadFileTree(parent);
            }
        });

        container.appendChild(header);

        // 文件列表容器
        const listContainer = document.createElement('div');
        listContainer.className = 'filetree-list';
        container.appendChild(listContainer);

        // 加载目录内容
        const items = await window.electronAPI.readDirectory(this.filetreeRoot);
        this._renderFileTreeItems(items, listContainer, 0);
    }

    /**
     * 渲染文件树项目（递归）
     * @param {Array} items - 文件/目录列表
     * @param {HTMLElement} container - 容器元素
     * @param {number} depth - 嵌套深度
     */
    _renderFileTreeItems(items, container, depth) {
        items.forEach(item => {
            // 只显示 Markdown 文件和文件夹
            if (!item.isDirectory && !['.md', '.markdown', '.txt'].includes(item.ext)) {
                return;
            }

            const el = document.createElement('div');
            el.className = 'filetree-item';
            if (item.isDirectory) el.classList.add('directory');

            // 高亮当前打开的文件
            if (this.currentFilePath && item.path === this.currentFilePath) {
                el.classList.add('active');
            }

            // 缩进
            const indent = depth * 16;

            el.innerHTML = `
                <div class="filetree-item-content" style="padding-left: ${indent}px">
                    <span class="filetree-toggle">${item.isDirectory ? '▶' : ''}</span>
                    <span class="filetree-icon">${item.isDirectory ? '📁' : '📄'}</span>
                    <span class="filetree-name">${item.name}</span>
                </div>
            `;

            const content = el.querySelector('.filetree-item-content');

            if (item.isDirectory) {
                // 文件夹点击事件
                let expanded = false;
                let childContainer = null;

                content.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    expanded = !expanded;

                    const toggle = el.querySelector('.filetree-toggle');
                    toggle.textContent = expanded ? '▼' : '▶';

                    if (expanded) {
                        // 展开
                        if (!childContainer) {
                            childContainer = document.createElement('div');
                            childContainer.className = 'filetree-children';
                            el.appendChild(childContainer);
                        }
                        const subItems = await window.electronAPI.readDirectory(item.path);
                        childContainer.innerHTML = '';
                        this._renderFileTreeItems(subItems, childContainer, depth + 1);
                        childContainer.style.display = 'block';
                    } else {
                        // 收起
                        if (childContainer) {
                            childContainer.style.display = 'none';
                        }
                    }
                });

                // 双击进入目录
                content.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    this._loadFileTree(item.path);
                });
            } else {
                // 文件点击事件 - 打开文件
                content.addEventListener('click', async () => {
                    const data = await window.electronAPI.readFile(item.path);
                    if (data && data.content) {
                        this.currentFilePath = data.filePath;
                        this._onFileLoaded(data.content, data.fileName);

                        // 更新文件树根目录为新文件所在目录
                        const newDir = await window.electronAPI.getCurrentDirectory();
                        if (newDir && newDir !== this.filetreeRoot) {
                            this.filetreeRoot = newDir;
                            this._renderFileTreeRoot();
                        } else {
                            // 只更新高亮
                            this._updateFileTreeHighlight();
                        }
                    }
                });
            }

            container.appendChild(el);
        });
    }

    /**
     * 更新文件树高亮（不重新加载）
     */
    _updateFileTreeHighlight() {
        const items = this.elements.filetree.querySelectorAll('.filetree-item');
        items.forEach(item => {
            const nameEl = item.querySelector('.filetree-name');
            if (!nameEl) return;

            // 简单的文件名匹配（不完美，但足够用）
            const isActive = this.currentFilePath &&
                this.currentFilePath.endsWith(nameEl.textContent);
            item.classList.toggle('active', isActive);
        });
    }

    /**
     * 循环侧边栏模式
     */
    _cycleSidebarMode() {
        const modes = ['hidden', 'outline', 'filetree'];
        const currentIndex = modes.indexOf(this.sidebarMode);
        this.sidebarMode = modes[(currentIndex + 1) % modes.length];
        this._applySidebarMode();
    }

    /**
     * 应用侧边栏模式
     */
    _applySidebarMode() {
        if (this.sidebarMode === 'hidden') {
            this.elements.sidebar?.classList.add('collapsed');
        } else {
            this.elements.sidebar?.classList.remove('collapsed');
            this._setSidebarPanel(this.sidebarMode);
        }
    }

    /**
     * 设置侧边栏面板
     */
    _setSidebarPanel(panel) {
        if (panel !== 'outline' && panel !== 'filetree') return;
        this.sidebarMode = panel;

        // 更新标签
        this.elements.sidebarTabs?.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.panel === panel);
        });

        // 更新面板
        this.elements.outlinePanel?.classList.toggle('active', panel === 'outline');
        this.elements.filetreePanel?.classList.toggle('active', panel === 'filetree');

        // 加载文件树
        if (panel === 'filetree') {
            this._loadFileTree();
        }
    }

    /**
     * 设置模式
     */
    _setMode(mode) {
        if (mode === 'edit' && !this.isEditMode) {
            this.isEditMode = true;
            this._updateModeUI();

            this.elements.content.style.display = 'none';
            this.elements.editorContainer.style.display = 'block';

            if (!this.editor && window.MditorEditor) {
                this.editor = new window.MditorEditor();
                const isDark = this.state.get('ui.theme') === 'dark';
                this.editor.init(this.elements.editorContainer, this.currentContent, {
                    isDark,
                    onChange: (content) => {
                        this.currentContent = content;
                        this._updateWordCount(content);
                        const outline = this.parser.extractOutline(content);
                        this.eventBus.emit(Events.OUTLINE_UPDATED, outline);

                        // 检测斜杠命令（在 onChange 中检测更可靠）
                        if (!this.slashMenuVisible) {
                            this._checkSlashTrigger();
                        }

                        // 自动保存（2秒 debounce）
                        this._scheduleAutoSave();
                    }
                });

                // 初始化斜杠命令事件处理
                this._initSlashCommands();

                // 初始化编辑器滚动条
                if (window.Scrollbar) {
                    Scrollbar.initEditorScrollbar();
                }
            } else if (this.editor) {
                this.editor.setValue(this.currentContent);
            }

            this.editor?.focus();

        } else if (mode === 'read' && this.isEditMode) {
            this.isEditMode = false;
            this._updateModeUI();

            if (this.editor) {
                this.currentContent = this.editor.getValue();
            }

            const html = this.parser.parse(this.currentContent);
            const outline = this.parser.extractOutline(this.currentContent);
            this.eventBus.emit(Events.CONTENT_PARSED, { html, outline });
            this.eventBus.emit(Events.OUTLINE_UPDATED, outline);

            this.elements.editorContainer.style.display = 'none';
            this.elements.content.style.display = 'block';
        }
    }

    /**
     * 更新模式 UI（图标显示目标状态，与主题切换逻辑一致）
     */
    _updateModeUI() {
        const modeIcon = this.elements.modeToggleBtn?.querySelector('.mode-icon');
        if (modeIcon) {
            // 图标显示"点击后会变成什么"
            if (this.isEditMode) {
                // 当前编辑模式 → 显示书本图标（点击切换到阅读）
                modeIcon.innerHTML = '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M4 4.5A2.5 2.5 0 016.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15z"/>';
            } else {
                // 当前阅读模式 → 显示铅笔图标（点击切换到编辑）
                modeIcon.innerHTML = '<path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>';
            }
        }
        if (this.elements.currentMode) {
            this.elements.currentMode.textContent = this.isEditMode ? '编辑' : '阅读';
        }
    }

    /**
     * 更新保存指示器
     */
    _updateSaveIndicator() {
        if (this.elements.saveIndicator) {
            this.elements.saveIndicator.classList.toggle('unsaved', this.hasUnsavedChanges);
        }
    }

    /**
     * 更新字数统计
     */
    _updateWordCount(content) {
        if (this.elements.wordCount) {
            const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
            const englishWords = (content.match(/[a-zA-Z]+/g) || []).length;
            const total = chineseChars + englishWords;
            this.elements.wordCount.textContent = `${total} 字`;
        }
    }

    /**
     * 调度自动保存（debounce 2秒）
     */
    _scheduleAutoSave() {
        // 清除之前的定时器
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
        }

        // 显示保存中状态
        this.elements.saveIndicator?.classList.add('saving');

        // 2秒后自动保存
        this.autoSaveTimer = setTimeout(() => {
            this._autoSave();
        }, 2000);
    }

    /**
     * 执行自动保存（静默）
     */
    async _autoSave() {
        if (!window.electronAPI?.saveFile) return;
        if (!this.currentFilePath) return;  // 新文件不自动保存

        const content = this.editor ? this.editor.getValue() : this.currentContent;

        try {
            const result = await window.electronAPI.saveFile(content, false);

            if (result.success) {
                this.hasUnsavedChanges = false;
                this.elements.saveIndicator?.classList.remove('saving');
                this._updateSaveIndicator();
                this._showToast('已自动保存', 'success');
            }
        } catch (e) {
            this.elements.saveIndicator?.classList.remove('saving');
            console.error('Auto-save failed:', e);
        }
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

        if (this.editor) {
            this.editor.setDarkMode(next === 'dark');
        }

        this.eventBus.emit(Events.THEME_CHANGED, next);
    }

    /**
     * 应用主题
     */
    _applyTheme() {
        const theme = this.state.get('ui.theme');
        document.body.dataset.theme = theme;

        // 更新主题图标
        const themeIcon = this.elements.themeBtn?.querySelector('.theme-icon');
        if (themeIcon) {
            if (theme === 'dark') {
                // 亮色模式时显示太阳图标
                themeIcon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
            } else {
                // 暗色模式时显示月亮图标
                themeIcon.innerHTML = '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>';
            }
        }

        // 切换代码高亮主题
        const hljsTheme = document.getElementById('hljs-theme');
        if (hljsTheme) {
            hljsTheme.href = theme === 'dark'
                ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css'
                : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css';
        }
    }

    /**
     * 加载演示内容
     */
    _loadDemo() {
        const demoContent = `# 欢迎使用 mditor

一个极简的 Markdown 编辑器，灵感来自 Typora 和 Obsidian。

---

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| \`Ctrl+N\` | 新建空白文档 |
| \`Ctrl+O\` | 打开文件 |
| \`Ctrl+S\` | 保存文件 |
| \`Ctrl+Shift+S\` | 另存为 |
| \`Ctrl+E\` | 切换编辑/阅读模式 |
| \`Ctrl+\\\` | 切换侧边栏（隐藏/目录/文件树） |

---

## 功能特色

- **无边框窗口** - 沉浸式写作体验
- **实时自动保存** - 2秒无操作自动保存
- **斜杠命令** - 输入 \`//\` 快速插入格式
- **聚焦模式** - 点击右上角靶心图标，专注当前段落
- **暗色主题** - 点击右上角月亮/太阳图标切换

---

## 开始使用

1. 拖拽 \`.md\` 文件到窗口
2. 或按 \`Ctrl+O\` 打开文件
3. 双击 md 文件直接打开（需安装版）
4. 点击左上角 \`+\` 新建文件

---

## 斜杠命令

在编辑模式下输入 \`//\` 可快速插入：

- 标题（H1-H3）
- **粗体**、*斜体*、\`代码\`
- 引用、列表、任务
- 链接、图片、分割线

---

> 享受写作的乐趣！✨
`;
        this._onFileLoaded(demoContent, '欢迎');
    }

    /**
     * 显示 Toast
     */
    _showToast(message, type = 'info') {
        // 简单 toast 实现
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 40px;
            left: 50%;
            transform: translateX(-50%);
            padding: 8px 16px;
            background: var(--bg-body);
            border: 1px solid var(--bg-hover);
            border-radius: 6px;
            font-size: 13px;
            z-index: 9999;
            animation: fadeIn 0.2s;
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
    }

    /**
     * 插入文本
     */
    _insertText(text, cursorOffset = 0) {
        if (this.editor && this.editor.view) {
            const { from } = this.editor.view.state.selection.main;
            this.editor.view.dispatch({
                changes: { from, insert: text },
                selection: { anchor: from + text.length + cursorOffset }
            });
            this.editor.focus();
        }
    }

    /**
     * 包裹文本
     */
    _wrapText(wrapper) {
        if (this.editor && this.editor.view) {
            const { from, to } = this.editor.view.state.selection.main;
            const selected = this.editor.view.state.sliceDoc(from, to);
            const newText = selected ? `${wrapper}${selected}${wrapper}` : `${wrapper}文本${wrapper}`;
            this.editor.view.dispatch({
                changes: { from, to, insert: newText },
                selection: { anchor: from + wrapper.length, head: from + newText.length - wrapper.length }
            });
            this.editor.focus();
        }
    }

    // ========== 斜杠命令 ==========

    /**
     * 初始化斜杠命令（仅事件处理，检测在 onChange 中）
     */
    _initSlashCommands() {
        if (this.slashCommandsInitialized || !this.editor?.view) return;
        this.slashCommandsInitialized = true;

        const view = this.editor.view;

        // 使用 keydown 处理菜单导航（必须在 keydown 阻止默认行为）
        view.dom.addEventListener('keydown', (e) => {
            if (this.slashMenuVisible) {
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
                    e.key === 'Enter' || e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    this._handleSlashNavigation(e.key);
                }
            }
        });

        // 点击其他地方关闭菜单
        document.addEventListener('mousedown', (e) => {
            if (this.slashMenuVisible && !this.elements.slashMenu?.contains(e.target)) {
                this._hideSlashMenu();
            }
        });

        // 编辑器失焦关闭菜单
        view.dom.addEventListener('blur', () => {
            setTimeout(() => {
                if (this.slashMenuVisible && !this.elements.slashMenu?.matches(':hover')) {
                    this._hideSlashMenu();
                }
            }, 150);
        });
    }

    /**
     * 检测 // 触发
     */
    _checkSlashTrigger() {
        if (!this.editor?.view) return;

        const state = this.editor.view.state;
        const pos = state.selection.main.from;

        // 检查光标前两个字符是否是 //
        if (pos >= 2) {
            const twoChars = state.sliceDoc(pos - 2, pos);
            if (twoChars === '//') {
                // 保存触发位置（关键修复！）
                this.slashTriggerPos = {
                    start: pos - 2,
                    end: pos
                };
                this._showSlashMenu();
            }
        }
    }

    /**
     * 显示菜单
     */
    _showSlashMenu() {
        if (!this.elements.slashMenu || !this.editor?.view) return;

        this.slashMenuVisible = true;
        this.slashMenuIndex = 0;

        // 定位到光标
        const coords = this.editor.view.coordsAtPos(this.editor.view.state.selection.main.from);
        if (!coords) return;

        const menu = this.elements.slashMenu;
        menu.style.display = 'block';
        menu.style.left = `${coords.left}px`;
        menu.style.top = `${coords.bottom + 4}px`;

        this._renderSlashMenu();
    }

    /**
     * 隐藏菜单
     */
    _hideSlashMenu() {
        this.slashMenuVisible = false;
        this.slashTriggerPos = null;
        if (this.elements.slashMenu) {
            this.elements.slashMenu.style.display = 'none';
        }
    }

    /**
     * 渲染菜单
     */
    _renderSlashMenu() {
        const list = this.elements.slashMenu?.querySelector('.slash-menu-list');
        if (!list) return;

        list.innerHTML = this.slashCommands.map((cmd, i) => `
            <div class="slash-menu-item${i === this.slashMenuIndex ? ' active' : ''}" data-i="${i}">
                <span class="slash-menu-icon">${cmd.icon}</span>
                <span class="slash-menu-label">${cmd.label}</span>
                <span class="slash-menu-hint">${cmd.hint}</span>
            </div>
        `).join('');

        // 确保选中项可见
        const activeItem = list.querySelector('.slash-menu-item.active');
        if (activeItem) {
            activeItem.scrollIntoView({ block: 'nearest' });
        }

        list.querySelectorAll('.slash-menu-item').forEach(el => {
            el.addEventListener('click', () => this._execSlashCmd(+el.dataset.i));
        });
    }

    /**
     * 处理菜单导航
     */
    _handleSlashNavigation(key) {
        if (key === 'ArrowUp') {
            this.slashMenuIndex = Math.max(0, this.slashMenuIndex - 1);
            this._renderSlashMenu();
        } else if (key === 'ArrowDown') {
            this.slashMenuIndex = Math.min(this.slashCommands.length - 1, this.slashMenuIndex + 1);
            this._renderSlashMenu();
        } else if (key === 'Enter') {
            this._execSlashCmd(this.slashMenuIndex);
        } else if (key === 'Escape') {
            this._hideSlashMenu();
        }
    }

    /**
     * 执行命令：替换 // 为格式文本
     */
    _execSlashCmd(i) {
        const cmd = this.slashCommands[i];
        if (!cmd || !this.editor?.view || !this.slashTriggerPos) return;

        const view = this.editor.view;
        const { start, end } = this.slashTriggerPos;  // 使用保存的位置！
        const text = cmd.text;

        // 计算光标位置
        let anchor = start + text.length;
        if (cmd.cursorOffset) anchor += cmd.cursorOffset;

        // 单次 dispatch 替换 // 为格式文本
        view.dispatch({
            changes: { from: start, to: end, insert: text },
            selection: cmd.selectFrom !== undefined
                ? { anchor: start + cmd.selectFrom, head: start + cmd.selectTo }
                : { anchor }
        });

        this._hideSlashMenu();
        view.focus();
    }
}

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
    window.app.init();
});
