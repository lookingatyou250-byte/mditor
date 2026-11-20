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

        // 设置面板状态
        this.settingsVisible = false;
        this.fontSize = parseInt(localStorage.getItem('mditor-font-size')) || 16;
        this.readerFont = localStorage.getItem('mditor-reader-font') || 'sans';
        this.contentWidth = localStorage.getItem('mditor-content-width') || 'medium';

        // 页内搜索状态
        this.searchVisible = false;
        this.searchMatches = [];
        this.searchIndex = -1;

        // 斜杠命令
        this.slashMenuVisible = false;
        this.slashMenuIndex = 0;
        this.slashCommandsInitialized = false;
        this.slashTriggerPos = null;  // 保存 // 的位置
        this.slashMenuExpanded = false;  // 是否展开全部

        // 快捷命令（默认显示）
        this.slashQuickCommands = [
            { icon: 'H1', label: '标题 1', hint: '# ', text: '# ' },
            { icon: 'H2', label: '标题 2', hint: '## ', text: '## ' },
            { icon: '•', label: '列表', hint: '- ', text: '- ' },
            { icon: '>', label: '引用', hint: '> ', text: '> ' },
        ];

        // 分组命令（查看全部）
        this.slashCommandGroups = [
            {
                name: '标题',
                commands: [
                    { icon: 'H1', label: 'H1', hint: '# ', text: '# ' },
                    { icon: 'H2', label: 'H2', hint: '## ', text: '## ' },
                    { icon: 'H3', label: 'H3', hint: '### ', text: '### ' },
                    { icon: 'H4', label: 'H4', hint: '#### ', text: '#### ' },
                    { icon: 'H5', label: 'H5', hint: '##### ', text: '##### ' },
                    { icon: 'H6', label: 'H6', hint: '###### ', text: '###### ' },
                ]
            },
            {
                name: '格式',
                commands: [
                    { icon: 'B', label: '粗体', hint: '**', text: '**文本**', selectFrom: 2, selectTo: 4 },
                    { icon: 'I', label: '斜体', hint: '*', text: '*文本*', selectFrom: 1, selectTo: 3 },
                    { icon: 'S', label: '删除', hint: '~~', text: '~~文本~~', selectFrom: 2, selectTo: 4 },
                    { icon: '`', label: '代码', hint: '`', text: '`代码`', selectFrom: 1, selectTo: 3 },
                    { icon: '==', label: '高亮', hint: '==', text: '==文本==', selectFrom: 2, selectTo: 4 },
                ]
            },
            {
                name: '结构',
                commands: [
                    { icon: '•', label: '列表', hint: '- ', text: '- ' },
                    { icon: '1.', label: '有序', hint: '1. ', text: '1. ' },
                    { icon: '☑', label: '任务', hint: '- [ ] ', text: '- [ ] ' },
                    { icon: '>', label: '引用', hint: '> ', text: '> ' },
                    { icon: '—', label: '分割', hint: '---', text: '\n---\n' },
                ]
            },
            {
                name: '高级',
                commands: [
                    { icon: '```', label: '代码块', hint: '```', text: '```\n\n```', cursorOffset: -4 },
                    { icon: '📊', label: '表格', hint: '| |', text: '| 列1 | 列2 |\n|---|---|\n| 内容 | 内容 |\n', cursorOffset: 0 },
                    { icon: '🔗', label: '链接', hint: '[]()', text: '[](url)', cursorOffset: -6 },
                    { icon: '🖼', label: '图片', hint: '![]()', text: '![](url)', cursorOffset: -6 },
                    { icon: '[^]', label: '脚注', hint: '[^1]', text: '[^1]\n\n[^1]: ', cursorOffset: 0 },
                ]
            }
        ];

        // 合并为平面列表（用于键盘导航）
        this.slashCommands = this.slashQuickCommands;

        // Bug 4 修复：高亮颜色优化，提升暗色模式下的可视性
        this.highlightColors = {
            amber: 'rgba(251, 191, 36, 0.4)',    // Warm yellow - 提高不透明度
            emerald: 'rgba(52, 211, 153, 0.35)', // Soft green - 提高不透明度
            sky: 'rgba(56, 189, 248, 0.35)',     // Light blue - 提高不透明度
            rose: 'rgba(251, 113, 133, 0.35)',   // Gentle pink - 提高不透明度
            violet: 'rgba(167, 139, 250, 0.4)'   // Soft purple - 提高不透明度
        };
        this.currentHighlightColor = localStorage.getItem('mditor-highlight-color') || 'amber';
        this.highlightPickerVisible = false;
        this.highlightTriggerVisible = false;
        this.highlightPickerTimer = null;
        this.highlightTriggerTimer = null;
        this._selectionTimeout = null;
        this._currentSelectionRange = null;
        this._lastCreatedMark = null;  // 追踪最近创建的高亮标记
        this._highlightsModified = false;  // 追踪高亮是否被修改

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
        this._syncThemeFromMain();  // 从 main 进程同步主题
        this._applySidebarMode();  // 应用默认侧边栏状态（隐藏）
        this._initScrollbar();     // 初始化自定义滚动条
        this._initSettings();      // 初始化设置
        this._initReadingProgress(); // 初始化顶部阅读进度条
        this._initSearch();        // 初始化页内搜索 (Ctrl+F)
        this._initLightbox();      // 初始化图片灯箱
        this._initZoomShortcut();  // 初始化 Ctrl+滚轮缩放
        this._initLiveReload();    // 初始化外部文件变更热刷新
        this._loadCustomColors();  // 加载自定义颜色
        this._checkInitialFile();
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

            // 欢迎页
            welcomePage: document.getElementById('welcome-page'),
            welcomeNew: document.getElementById('welcome-new'),
            welcomeOpen: document.getElementById('welcome-open'),

            // 编辑器
            editorContainer: document.getElementById('editor'),

            // 状态栏
            wordCount: document.getElementById('word-count'),
            currentMode: document.getElementById('current-mode'),
            brandLink: document.getElementById('brand-link'),

            // 斜杠菜单
            slashMenu: document.getElementById('slash-menu'),

            // 高亮选择器
            highlightTrigger: document.getElementById('highlight-trigger'),
            highlightPicker: document.getElementById('highlight-picker'),
            colorAddPopup: document.getElementById('color-add-popup'),
            colorInput: document.getElementById('color-input'),
            colorPreview: document.getElementById('color-preview'),

            // 文件菜单
            fileMenuBtn: document.getElementById('file-menu-btn'),
            fileDropdown: document.getElementById('file-dropdown'),
            fileRenameInput: document.getElementById('file-rename-input'),

            // 设置面板
            settingsBtn: document.getElementById('settings-toggle'),
            settingsPanel: document.getElementById('settings-panel'),
            settingsClose: document.getElementById('settings-close'),
            settingsOverlay: document.querySelector('.settings-overlay'),
            fontSizeSlider: document.getElementById('font-size-slider'),
            fontSizeValue: document.getElementById('font-size-value'),
            fontSizeDec: document.getElementById('font-size-dec'),
            fontSizeInc: document.getElementById('font-size-inc'),
            fontFamilySegment: document.getElementById('font-family-segment'),
            contentWidthSegment: document.getElementById('content-width-segment'),
            checkUpdateBtn: document.getElementById('check-update-btn'),
            appVersion: document.getElementById('app-version'),

            // 阅读进度条 & 搜索条 & 图片灯箱
            readingProgressBar: document.getElementById('reading-progress-bar'),
            searchBar: document.getElementById('search-bar'),
            searchInput: document.getElementById('search-input'),
            searchCount: document.getElementById('search-count'),
            searchPrev: document.getElementById('search-prev'),
            searchNext: document.getElementById('search-next'),
            searchClose: document.getElementById('search-close'),
            imageLightbox: document.getElementById('image-lightbox'),
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
        // 文件事件（拖拽或原生文件选择器触发）
        this.eventBus.on(Events.FILE_LOADED, ({ content, fileName, filePath }) => {
            if (filePath) {
                this.currentFilePath = filePath;
                window.electronAPI?.setCurrentFile?.(filePath);
            }
            this._onFileLoaded(content, fileName);
            if (filePath) {
                this._loadFileTree();
            }
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

        // 品牌链接点击 → 打开仓库
        this.elements.brandLink?.addEventListener('click', (e) => {
            e.preventDefault();
            window.electronAPI?.openExternal?.('https://github.com/lookingatyou250-byte/mditor')
                || window.open('https://github.com/lookingatyou250-byte/mditor', '_blank');
        });

        // 文件菜单按钮
        this.elements.fileMenuBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._toggleFileDropdown();
        });

        // 文件下拉菜单项
        this.elements.fileDropdown?.querySelectorAll('.file-dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                this._handleFileDropdownAction(item.dataset.action);
            });
        });

        // 点击外部关闭下拉菜单
        document.addEventListener('click', () => {
            this._hideFileDropdown();
        });

        // 阅读模式：双击临时高亮移除（修复 Bug 1）
        this.elements.content?.addEventListener('dblclick', (e) => {
            if (!this.isEditMode && e.target.tagName === 'MARK' && e.target.classList.contains('temp-highlight')) {
                e.preventDefault();
                this._removeReadModeHighlight(e.target);
            }
        });

        // 阅读模式：选中文字自动浮现高亮触发图标
        this.elements.content?.addEventListener('mouseup', (e) => {
            // 只在阅读模式下响应
            if (this.isEditMode) return;

            // 延迟 150ms 检测选区，避免误触
            if (this._selectionTimeout) {
                clearTimeout(this._selectionTimeout);
            }

            this._selectionTimeout = setTimeout(() => {
                this._handleReadModeSelection();
            }, 150);
        });

        // 点击其他地方时隐藏
        document.addEventListener('mousedown', (e) => {
            // 如果点击的是触发图标、选择器或颜色添加弹窗，不隐藏
            if (e.target.closest('.highlight-trigger') ||
                e.target.closest('.highlight-picker') ||
                e.target.closest('.color-add-popup')) {
                return;
            }
            // 其他情况隐藏所有
            if (this.highlightTriggerVisible && !this.isEditMode) {
                this._hideHighlightTrigger();
            }
            if (this.highlightPickerVisible && !this.isEditMode) {
                this._hideHighlightPicker();
            }
        });

        // 高亮触发图标：阻止 mousedown 清除选区
        this.elements.highlightTrigger?.addEventListener('mousedown', (e) => {
            e.preventDefault(); // 阻止默认行为，保持选区
            e.stopPropagation();
        });

        // 高亮触发图标点击事件
        this.elements.highlightTrigger?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this._currentSelectionRange) {
                this._showHighlightPickerForReadMode(this._currentSelectionRange);
            }
        });
    }

    /**
     * 切换文件下拉菜单
     */
    _toggleFileDropdown() {
        const dropdown = this.elements.fileDropdown;
        if (!dropdown) return;

        const isVisible = dropdown.style.display !== 'none';
        if (isVisible) {
            this._hideFileDropdown();
        } else {
            this._showFileDropdown();
        }
    }

    /**
     * 显示文件下拉菜单
     */
    _showFileDropdown() {
        const dropdown = this.elements.fileDropdown;
        if (!dropdown) return;

        // 更新菜单项状态
        const showInFolderItem = dropdown.querySelector('[data-action="show-in-folder"]');
        if (showInFolderItem) {
            showInFolderItem.classList.toggle('disabled', !this.currentFilePath);
        }

        dropdown.style.display = 'block';
    }

    /**
     * 隐藏文件下拉菜单
     */
    _hideFileDropdown() {
        if (this.elements.fileDropdown) {
            this.elements.fileDropdown.style.display = 'none';
        }
    }

    /**
     * 处理文件下拉菜单动作
     */
    async _handleFileDropdownAction(action) {
        this._hideFileDropdown();

        switch (action) {
            case 'save':
                this._saveFile(false);
                break;
            case 'save-as':
                this._saveFile(true);
                break;
            case 'show-in-folder':
                if (this.currentFilePath && window.electronAPI?.showInFolder) {
                    await window.electronAPI.showInFolder(this.currentFilePath);
                }
                break;
        }
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
            // 已保存文件：进入重命名模式
            this._startRename();
        }
    }

    /**
     * 开始重命名
     */
    _startRename() {
        if (!this.currentFilePath) return;

        const input = this.elements.fileRenameInput;
        const fileNameEl = this.elements.fileName;
        if (!input || !fileNameEl) return;

        // 获取当前文件名
        const currentName = fileNameEl.textContent;

        // 隐藏文件名，显示输入框
        fileNameEl.style.display = 'none';
        this.elements.fileMenuBtn.style.display = 'none';
        this.elements.saveIndicator.style.display = 'none';

        input.value = currentName;
        input.style.display = 'block';
        input.focus();

        // 选中文件名（不含扩展名）
        const dotIndex = currentName.lastIndexOf('.');
        if (dotIndex > 0) {
            input.setSelectionRange(0, dotIndex);
        } else {
            input.select();
        }

        // 绑定事件
        const handleBlur = () => this._finishRename();
        const handleKeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this._finishRename();
            } else if (e.key === 'Escape') {
                this._cancelRename();
            }
        };

        input.addEventListener('blur', handleBlur, { once: true });
        input.addEventListener('keydown', handleKeydown);

        // 保存清理函数
        input._cleanup = () => {
            input.removeEventListener('keydown', handleKeydown);
        };
    }

    /**
     * 完成重命名
     */
    async _finishRename() {
        const input = this.elements.fileRenameInput;
        if (!input || input.style.display === 'none') return;

        const newName = input.value.trim();
        const oldName = this.elements.fileName.textContent;

        // 清理
        input._cleanup?.();
        input.style.display = 'none';
        this.elements.fileName.style.display = '';
        this.elements.fileMenuBtn.style.display = '';
        this.elements.saveIndicator.style.display = '';

        // 如果名称相同或为空，取消
        if (!newName || newName === oldName) return;

        // 确保有扩展名
        let finalName = newName;
        if (!finalName.includes('.')) {
            finalName += '.md';
        }

        // 执行重命名
        if (window.electronAPI?.renameFile) {
            const result = await window.electronAPI.renameFile(this.currentFilePath, finalName);
            if (result.success) {
                this.currentFilePath = result.filePath;
                this.elements.fileName.textContent = result.fileName;
                this._showToast(`已重命名为: ${result.fileName}`, 'success');
                this._loadFileTree();
            } else {
                this._showToast(`重命名失败: ${result.error}`, 'error');
            }
        }
    }

    /**
     * 取消重命名
     */
    _cancelRename() {
        const input = this.elements.fileRenameInput;
        if (!input) return;

        input._cleanup?.();
        input.style.display = 'none';
        this.elements.fileName.style.display = '';
        this.elements.fileMenuBtn.style.display = '';
        this.elements.saveIndicator.style.display = '';
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

            // Ctrl+H 高亮
            if (e.ctrlKey && !e.shiftKey && e.key === 'h') {
                e.preventDefault();
                this._toggleHighlight();
            }

            // Ctrl+F 页内查找
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                this._openSearch();
            }

            // Ctrl+0 重置字号
            if ((e.ctrlKey || e.metaKey) && e.key === '0') {
                e.preventDefault();
                this.fontSize = 16;
                this._updateFontSizeUI();
                this._applyFontSize();
                this._saveFontSize();
                this._showToast('字号已重置为 16px', 'info');
            }

            // Esc 关闭灯箱或搜索条
            if (e.key === 'Escape') {
                if (this.elements.imageLightbox && this.elements.imageLightbox.style.display !== 'none') {
                    this._closeLightbox();
                } else if (this.searchVisible) {
                    this._closeSearch();
                }
            }

            // Ctrl+Shift+H 保存高亮到本地
            if (e.ctrlKey && e.shiftKey && e.key === 'H') {
                e.preventDefault();
                if (!this.isEditMode && this.currentFilePath) {
                    this._saveHighlightsToPersistence();
                    this._showToast('高亮已保存', 'success');
                }
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
                // 检查是否有文件数据（content 可能是空字符串，所以用 !== undefined）
                if (data && data.content !== undefined) {
                    this.currentFilePath = data.filePath;
                    this._onFileLoaded(data.content, data.fileName);
                    this._loadFileTree();
                    return;
                }
            } catch (e) {
                console.error('Failed to get initial file:', e);
            }
        }
        // 无初始文件，显示欢迎页内容
        this._loadDemo();
    }

    /**
     * 隐藏欢迎页
     */
    _hideWelcome() {
        if (this.elements.welcomePage) {
            this.elements.welcomePage.style.display = 'none';
        }
    }

    /**
     * 文件加载处理
     */
    _onFileLoaded(content, fileName) {
        // 隐藏欢迎页，显示内容区
        this._hideWelcome();
        this.elements.content.style.display = 'block';

        this.currentContent = content;
        this.hasUnsavedChanges = false;

        // 更新文件名
        if (this.elements.fileName) {
            this.elements.fileName.textContent = fileName;
        }

        this._updateSaveIndicator();
        this._updateWordCount(content);

        // 设置解析基准目录，确保本地相对路径图片正常显示
        this.parser.setBasePath(this.currentFilePath);

        // 关闭旧的搜索高亮
        if (this.searchVisible) {
            this._closeSearch();
        }

        // 解析并渲染
        const html = this.parser.parse(content);
        const outline = this.parser.extractOutline(content);

        this.eventBus.emit(Events.CONTENT_PARSED, { html, outline });
        this.eventBus.emit(Events.OUTLINE_UPDATED, outline);

        // 新文件重置滚动条与进度条
        if (this.elements.content) {
            this.elements.content.scrollTop = 0;
        }
        this._updateReadingProgress();

        // 同步编辑器
        if (this.editor && this.isEditMode) {
            this.editor.setValue(content);
        }

        this._showToast(`已加载: ${fileName}`, 'success');

        // 空白文件自动进入编辑模式
        if (!content || !content.trim()) {
            this._setMode('edit');
            return;
        }

        // 在阅读模式下，延迟加载持久化的高亮
        if (!this.isEditMode) {
            setTimeout(() => {
                this._loadHighlightsFromPersistence();
            }, 100);
        }
    }

    /**
     * 打开文件
     */
    async _openFile() {
        if (window.electronAPI?.openFileDialog) {
            const result = await window.electronAPI.openFileDialog();
            if (result && result.content !== undefined) {
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
        // 隐藏欢迎页
        this._hideWelcome();

        this.currentContent = '';
        this.currentFilePath = null;
        this.parser.setBasePath(null);
        window.electronAPI?.setCurrentFile?.(null);

        if (this.elements.fileName) {
            this.elements.fileName.textContent = '未命名';
        }

        this.renderer.clear?.();
        this.outline.clear?.();

        if (this.editor) {
            this.editor.setValue('');
        }

        this._setMode('edit');
        this.hasUnsavedChanges = false;
        this._updateSaveIndicator();
        this._updateWordCount('');
        this._updateReadingProgress();
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
                    if (data && data.content !== undefined) {
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
            // 切换前记录阅读视图的滚动进度
            const readScrollRatio = this.renderer.getScrollPercentage();

            this.isEditMode = true;
            this._updateModeUI();

            // 保存当前的高亮信息
            this._saveHighlights();

            // 清除阅读模式的临时高亮和触发器
            this._clearAllReadModeHighlights();
            this._hideHighlightTrigger();
            this._hideHighlightPicker();

            this.elements.content.style.display = 'none';
            this.elements.editorContainer.style.display = 'block';

            if (!this.editor && window.MditorEditor) {
                this.editor = new window.MditorEditor();
                const isDark = this.state.get('ui.theme') === 'dark';
                this.editor.init(this.elements.editorContainer, this.currentContent, {
                    isDark,
                    onChange: (content) => {
                        if (content === this.currentContent) return;
                        this.currentContent = content;
                        this.hasUnsavedChanges = true;
                        this._updateSaveIndicator();
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
            // 同步阅读视图的滚动进度到编辑器
            requestAnimationFrame(() => {
                this.editor?.setScrollPercentage(readScrollRatio);
            });
            this._updateReadingProgress();
            if (this.searchVisible) {
                this._performSearch();
            }

        } else if (mode === 'read' && this.isEditMode) {
            // 切换前记录编辑器的滚动进度
            const editScrollRatio = this.editor ? this.editor.getScrollPercentage() : 0;

            this.isEditMode = false;
            this._updateModeUI();

            if (this.editor) {
                this.currentContent = this.editor.getValue();
            }

            // 如果有文件打开但内容为空，显示空白而不是欢迎提示
            this.parser.setBasePath(this.currentFilePath);
            const hasContent = this.currentContent && this.currentContent.trim();
            const html = hasContent
                ? this.parser.parse(this.currentContent)
                : (this.currentFilePath ? ' ' : '');  // 有文件但空内容，传递空格避免显示欢迎提示
            const outline = this.parser.extractOutline(this.currentContent);
            this.eventBus.emit(Events.CONTENT_PARSED, { html, outline });
            this.eventBus.emit(Events.OUTLINE_UPDATED, outline);

            this.elements.editorContainer.style.display = 'none';
            this.elements.content.style.display = 'block';

            // 同步编辑器的滚动进度到阅读视图
            requestAnimationFrame(() => {
                this.renderer.setScrollPercentage(editScrollRatio);
                this._updateReadingProgress();
                if (this.searchVisible) {
                    this._performSearch();
                }
            });

            // 恢复之前保存的高亮（临时的，在模式切换时保存的）
            this._restoreHighlights();

            // 如果没有临时高亮，尝试从持久化存储加载
            setTimeout(() => {
                const allMarks = this.elements.content?.querySelectorAll('mark.temp-highlight');
                if (!allMarks || allMarks.length === 0) {
                    this._loadHighlightsFromPersistence();
                }
            }, 100);
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
     * 更新字数与预计阅读时长统计
     */
    _updateWordCount(content) {
        if (this.elements.wordCount) {
            const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
            const englishWords = (content.match(/[a-zA-Z]+/g) || []).length;
            const total = chineseChars + englishWords;
            if (total === 0) {
                this.elements.wordCount.textContent = '0 字';
            } else {
                const minutes = Math.max(1, Math.ceil(total / 350));
                this.elements.wordCount.textContent = `${total} 字 · 约 ${minutes} 分钟`;
            }
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

        // 切换代码高亮主题（使用本地离线样式）
        const hljsTheme = document.getElementById('hljs-theme');
        if (hljsTheme) {
            hljsTheme.href = theme === 'dark'
                ? 'lib/hljs-github-dark.min.css'
                : 'lib/hljs-github.min.css';
        }
    }

    /**
     * 从 main 进程同步主题（启动时和跨窗口同步）
     */
    async _syncThemeFromMain() {
        // 立即注册监听器（不要放在 await 之后，以免错过消息）
        if (window.electronAPI?.onThemeChanged) {
            window.electronAPI.onThemeChanged((theme) => {
                if (theme !== this.state.get('ui.theme')) {
                    this.state.set('ui.theme', theme);
                    localStorage.setItem('md-reader-theme', theme);
                    this._applyTheme();
                    if (this.editor) {
                        this.editor.setDarkMode(theme === 'dark');
                    }
                }
            });
        }

        // 从 main 进程获取全局主题设置
        if (window.electronAPI?.getTheme) {
            const theme = await window.electronAPI.getTheme();
            if (theme && theme !== this.state.get('ui.theme')) {
                this.state.set('ui.theme', theme);
                localStorage.setItem('md-reader-theme', theme);
                this._applyTheme();
                if (this.editor) {
                    this.editor.setDarkMode(theme === 'dark');
                }
            }
        }
    }

    /**
     * 加载演示内容
     */
    _loadDemo() {
        const demoContent = `# 欢迎使用 mditor

一个极简的 Markdown 编辑器，灵感来自 Typora 和 Obsidian。

---

## 核心特色

### // 斜杠命令
编辑时输入 //，所有格式触手可及，无需记忆快捷键。

### 点击文件名
新建后点击文件名即可保存，这是最自然的位置。

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
- **聚焦模式** - 点击右上角靶心图标，专注当前段落
- **暗色主题** - 点击右上角月亮/太阳图标切换

---

## 开始使用

1. 拖拽 \`.md\` 文件到窗口
2. 或按 \`Ctrl+O\` 打开文件
3. 双击 md 文件直接打开（需安装版）
4. 点击左上角 \`+\` 新建文件

---

> 享受写作的乐趣。
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

    // ========== 高亮功能 ==========

    /**
     * 切换高亮（Ctrl+H）
     */
    _toggleHighlight() {
        // 编辑模式：插入 ==text== 语法
        if (this.isEditMode && this.editor?.view) {
            const { from, to } = this.editor.view.state.selection.main;

            // 有选中文本时，直接应用高亮并显示颜色选择器
            if (from !== to) {
                this._applyHighlight();
                this._showHighlightPicker();
            }
            return;
        }

        // 阅读模式：临时高亮（不修改源文件）
        if (!this.isEditMode) {
            this._toggleReadModeHighlight();
        }
    }

    /**
     * 应用高亮
     */
    _applyHighlight(color = this.currentHighlightColor) {
        if (!this.editor?.view) return;

        const { from, to } = this.editor.view.state.selection.main;
        const selected = this.editor.view.state.sliceDoc(from, to);

        if (!selected) return;

        // 用 == 包裹（标准 Markdown 高亮语法）
        const newText = `==${selected}==`;
        this.editor.view.dispatch({
            changes: { from, to, insert: newText },
            selection: { anchor: from + 2, head: from + 2 + selected.length }
        });
        this.editor.focus();
    }

    /**
     * 显示颜色选择器
     */
    _showHighlightPicker() {
        const picker = this.elements.highlightPicker;
        if (!picker || !this.editor?.view) return;

        // 清除之前的定时器
        if (this.highlightPickerTimer) {
            clearTimeout(this.highlightPickerTimer);
        }

        // 获取选区位置
        const { from } = this.editor.view.state.selection.main;
        const coords = this.editor.view.coordsAtPos(from);
        if (!coords) return;

        // 定位到选区上方
        picker.style.display = 'flex';
        picker.classList.remove('fade-out');

        const pickerRect = picker.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // 计算位置并进行边界检查
        let left = coords.left - pickerRect.width / 2 + 20;
        let top = coords.top - 40;

        // 左边界检查
        if (left < 10) left = 10;
        // 右边界检查
        if (left + pickerRect.width > viewportWidth - 10) {
            left = viewportWidth - pickerRect.width - 10;
        }
        // 上边界检查（如果上方放不下，放到下方）
        if (top < 10) {
            top = coords.bottom + 8;
        }

        picker.style.left = `${left}px`;
        picker.style.top = `${top}px`;

        // 标记当前颜色
        picker.querySelectorAll('.highlight-dot').forEach(dot => {
            dot.classList.toggle('active', dot.dataset.color === this.currentHighlightColor);
        });

        this.highlightPickerVisible = true;

        // 2秒后自动隐藏
        this.highlightPickerTimer = setTimeout(() => {
            this._hideHighlightPicker();
        }, 2000);

        // 绑定键盘事件（只绑定一次）
        if (!this._highlightPickerKeyboardBound) {
            this._highlightPickerKeyboardBound = true;
            this._bindHighlightPickerKeyboard();
        }

        // 确保事件已绑定
        this._ensurePickerEventsBound(picker);
    }

    /**
     * 确保颜色选择器事件已绑定（只绑定一次）
     */
    _ensurePickerEventsBound(picker) {
        if (this._highlightPickerBound) return;
        this._highlightPickerBound = true;

        // 拖拽相关变量
        let longPressTimer = null;
        let longPressTarget = null;
        let isDragging = false;
        let dragClone = null;
        let deleteZone = null;

        // 获取或创建删除区域
        const getDeleteZone = () => {
            if (!deleteZone) {
                deleteZone = document.getElementById('delete-zone');
            }
            return deleteZone;
        };

        // 显示删除区域
        const showDeleteZone = () => {
            const zone = getDeleteZone();
            if (zone) {
                zone.style.display = 'flex';
                zone.classList.remove('fade-out');
            }
        };

        // 隐藏删除区域
        const hideDeleteZone = () => {
            const zone = getDeleteZone();
            if (zone) {
                zone.classList.add('fade-out');
                setTimeout(() => {
                    zone.style.display = 'none';
                    zone.classList.remove('fade-out', 'active');
                }, 200);
            }
        };

        // 检查是否在删除区域内
        const isInDeleteZone = (x, y) => {
            const zone = getDeleteZone();
            if (!zone) return false;
            const rect = zone.getBoundingClientRect();
            return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        };

        // 开始拖拽
        const startDrag = (dot, clientX, clientY) => {
            if (isDragging) return;
            isDragging = true;

            // 创建拖拽克隆
            dragClone = dot.cloneNode(true);
            dragClone.classList.add('dragging');
            dragClone.classList.remove('long-pressing');
            document.body.appendChild(dragClone);

            // 设置初始位置（中心对齐）
            dragClone.style.left = (clientX - 8) + 'px';
            dragClone.style.top = (clientY - 8) + 'px';

            // 隐藏原始元素
            dot.style.opacity = '0.3';

            // 显示删除区域
            showDeleteZone();
        };

        // 更新拖拽位置
        const updateDrag = (clientX, clientY) => {
            if (!dragClone) return;

            dragClone.style.left = (clientX - 8) + 'px';
            dragClone.style.top = (clientY - 8) + 'px';

            // 检查是否进入删除区域
            const zone = getDeleteZone();
            if (zone) {
                if (isInDeleteZone(clientX, clientY)) {
                    zone.classList.add('active');
                } else {
                    zone.classList.remove('active');
                }
            }
        };

        // 结束拖拽
        const endDrag = (dot, clientX, clientY) => {
            if (!isDragging) return;

            const shouldDelete = isInDeleteZone(clientX, clientY);

            // 移除拖拽克隆
            if (dragClone) {
                dragClone.remove();
                dragClone = null;
            }

            // 恢复原始元素
            dot.style.opacity = '';

            // 隐藏删除区域
            hideDeleteZone();

            // 执行删除
            if (shouldDelete) {
                const color = dot.dataset.color;
                if (color && color.startsWith('custom-')) {
                    this._deleteCustomColor(color);
                }
            }

            isDragging = false;
        };

        // 取消操作
        const cancelOperation = () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
            if (longPressTarget) {
                longPressTarget.classList.remove('long-pressing');
                longPressTarget.style.opacity = '';
                longPressTarget = null;
            }
            if (isDragging && dragClone) {
                dragClone.remove();
                dragClone = null;
                hideDeleteZone();
                isDragging = false;
            }
        };

        // 鼠标事件
        picker.addEventListener('mousedown', (e) => {
            e.preventDefault();

            const dot = e.target.closest('.highlight-dot');
            if (!dot || dot.dataset.action === 'add') return;

            const color = dot.dataset.color;
            // 只有自定义颜色可以长按拖拽删除
            if (!color || !color.startsWith('custom-')) return;

            // 开始长按计时
            longPressTarget = dot;
            dot.classList.add('long-pressing');

            const startX = e.clientX;
            const startY = e.clientY;

            longPressTimer = setTimeout(() => {
                // 500ms 后进入拖拽模式
                startDrag(dot, startX, startY);
                longPressTimer = null;
            }, 500);
        });

        // 全局鼠标移动（处理拖拽）
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                updateDrag(e.clientX, e.clientY);
            } else if (longPressTarget) {
                // 如果还在长按阶段但鼠标移动了，取消长按
                cancelOperation();
            }
        });

        // 全局鼠标松开
        document.addEventListener('mouseup', (e) => {
            if (isDragging && longPressTarget) {
                endDrag(longPressTarget, e.clientX, e.clientY);
                longPressTarget = null;
            } else {
                cancelOperation();
            }
        });

        // 触摸事件支持（移动端）
        picker.addEventListener('touchstart', (e) => {
            const dot = e.target.closest('.highlight-dot');
            if (!dot || dot.dataset.action === 'add') return;

            const color = dot.dataset.color;
            // 只有自定义颜色可以长按拖拽删除
            if (!color || !color.startsWith('custom-')) return;

            const touch = e.touches[0];
            longPressTarget = dot;
            dot.classList.add('long-pressing');

            const startX = touch.clientX;
            const startY = touch.clientY;

            longPressTimer = setTimeout(() => {
                // 500ms 后进入拖拽模式
                startDrag(dot, startX, startY);
                longPressTimer = null;
            }, 500);
        });

        // 触摸移动
        document.addEventListener('touchmove', (e) => {
            if (isDragging) {
                e.preventDefault();
                const touch = e.touches[0];
                updateDrag(touch.clientX, touch.clientY);
            } else if (longPressTarget) {
                // 如果还在长按阶段但手指移动了，取消长按
                cancelOperation();
            }
        }, { passive: false });

        // 触摸结束
        document.addEventListener('touchend', (e) => {
            if (isDragging && longPressTarget) {
                const touch = e.changedTouches[0];
                endDrag(longPressTarget, touch.clientX, touch.clientY);
                longPressTarget = null;
            } else {
                cancelOperation();
            }
        });

        document.addEventListener('touchcancel', cancelOperation);

        picker.addEventListener('click', (e) => {
            const dot = e.target.closest('.highlight-dot');
            if (!dot) return;

            // 点击加号按钮
            if (dot.dataset.action === 'add') {
                this._showColorHint(dot);
                return;
            }

            const color = dot.dataset.color;
            if (color) {
                this._setHighlightColor(color);

                // 重置定时器
                if (this.highlightPickerTimer) {
                    clearTimeout(this.highlightPickerTimer);
                }
                this.highlightPickerTimer = setTimeout(() => {
                    this._hideHighlightPicker();
                }, 1500);
            }
        });

        // 鼠标悬停时暂停计时
        picker.addEventListener('mouseenter', () => {
            if (this.highlightPickerTimer) {
                clearTimeout(this.highlightPickerTimer);
            }
        });

        picker.addEventListener('mouseleave', (e) => {
            // Bug 2 修复：如果鼠标移动到颜色添加弹窗，不立即隐藏
            const relatedTarget = e.relatedTarget;
            if (relatedTarget && relatedTarget.closest && relatedTarget.closest('.color-add-popup')) {
                return; // 鼠标移动到弹窗，保持显示
            }
            this._hideColorHint();
            this.highlightPickerTimer = setTimeout(() => {
                this._hideHighlightPicker();
            }, 1000);
        });
    }

    /**
     * 隐藏颜色选择器
     */
    _hideHighlightPicker() {
        const picker = this.elements.highlightPicker;
        if (!picker) return;

        // 清理定时器
        if (this.highlightPickerTimer) {
            clearTimeout(this.highlightPickerTimer);
            this.highlightPickerTimer = null;
        }

        picker.classList.add('fade-out');
        setTimeout(() => {
            picker.style.display = 'none';
            picker.classList.remove('fade-out');
        }, 200);

        this.highlightPickerVisible = false;

        // 隐藏选择器后，清除选区
        if (!this.isEditMode) {
            const selection = window.getSelection();
            selection?.removeAllRanges();
            this._currentSelectionRange = null;
        }
    }

    /**
     * 绑定颜色选择器键盘事件
     */
    _bindHighlightPickerKeyboard() {
        document.addEventListener('keydown', (e) => {
            // 只在编辑模式下且选择器可见时响应键盘
            // 阅读模式下不拦截方向键，避免影响正常浏览
            if (!this.highlightPickerVisible || !this.isEditMode) return;

            const picker = this.elements.highlightPicker;
            if (!picker) return;

            const colors = Array.from(picker.querySelectorAll('.highlight-dot[data-color]'));
            const currentIndex = colors.findIndex(dot => dot.dataset.color === this.currentHighlightColor);

            if (e.key === 'Escape') {
                // Esc: 关闭选择器
                e.preventDefault();
                this._hideHighlightPicker();
            } else if (e.key === 'ArrowLeft') {
                // 左箭头: 切换到上一个颜色
                e.preventDefault();
                const prevIndex = currentIndex > 0 ? currentIndex - 1 : colors.length - 1;
                const prevColor = colors[prevIndex]?.dataset.color;
                if (prevColor) {
                    this._setHighlightColor(prevColor);
                }
            } else if (e.key === 'ArrowRight') {
                // 右箭头: 切换到下一个颜色
                e.preventDefault();
                const nextIndex = currentIndex < colors.length - 1 ? currentIndex + 1 : 0;
                const nextColor = colors[nextIndex]?.dataset.color;
                if (nextColor) {
                    this._setHighlightColor(nextColor);
                }
            } else if (e.key === 'Enter') {
                // Enter: 确认当前颜色并关闭
                e.preventDefault();
                this._hideHighlightPicker();
                // 回到编辑器焦点
                if (this.editor?.focus) {
                    this.editor.focus();
                }
            }
        });
    }

    /**
     * 设置高亮颜色
     */
    _setHighlightColor(color) {
        this.currentHighlightColor = color;
        localStorage.setItem('mditor-highlight-color', color);

        // 更新选中状态
        const picker = this.elements.highlightPicker;
        if (picker) {
            picker.querySelectorAll('.highlight-dot').forEach(dot => {
                dot.classList.toggle('active', dot.dataset.color === color);
            });
        }

        // 阅读模式：点击颜色后自动应用高亮
        if (!this.isEditMode) {
            // 使用保存的选区
            if (this._currentSelectionRange) {
                this._applyReadModeHighlight(this._currentSelectionRange, color);
                // 延迟隐藏选择器
                if (this.highlightPickerTimer) {
                    clearTimeout(this.highlightPickerTimer);
                }
                this.highlightPickerTimer = setTimeout(() => {
                    this._hideHighlightPicker();
                }, 500);
                return;
            }
            // 如果没有保存的选区，更新最近添加的高亮颜色
            this._updateLastReadModeHighlight(color);
        }
    }

    /**
     * 显示颜色添加弹窗
     */
    _showColorHint(targetEl) {
        const popup = this.elements.colorAddPopup;
        const input = this.elements.colorInput;
        const preview = this.elements.colorPreview;
        if (!popup || !input) return;

        // 定位
        const rect = targetEl.getBoundingClientRect();
        popup.style.display = 'block';
        popup.classList.remove('fade-out');
        popup.style.left = `${rect.left - 100}px`;
        popup.style.top = `${rect.bottom + 8}px`;

        // 重置
        input.value = '';
        preview.style.background = 'var(--bg-hover)';

        // 聚焦输入框
        setTimeout(() => input.focus(), 50);

        // 绑定事件（只绑定一次，避免重复绑定）
        // 注意：事件监听器不会被移除，因为弹窗在整个应用生命周期中复用
        // 如需完全清理，可在 App 类添加 destroy() 方法
        if (!this._colorInputBound) {
            this._colorInputBound = true;

            // 实时预览颜色
            input.addEventListener('input', () => {
                const val = input.value.trim();
                if (this._isValidColor(val)) {
                    preview.style.background = val;
                } else {
                    preview.style.background = 'var(--bg-hover)';
                }
            });

            // 回车添加颜色
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this._addCustomColor(input.value.trim());
                }
                if (e.key === 'Escape') {
                    this._hideColorHint();
                }
            });

            // Bug 2 修复：鼠标进入弹窗时保持显示
            popup.addEventListener('mouseenter', () => {
                if (this.highlightPickerTimer) {
                    clearTimeout(this.highlightPickerTimer);
                }
            });

            // Bug 2 修复：鼠标离开弹窗时才隐藏
            popup.addEventListener('mouseleave', () => {
                this._hideColorHint();
                // 同时隐藏颜色选择器
                if (this.highlightPickerVisible) {
                    this.highlightPickerTimer = setTimeout(() => {
                        this._hideHighlightPicker();
                    }, 500);
                }
            });
        }
    }

    /**
     * 隐藏颜色添加弹窗
     */
    _hideColorHint() {
        const popup = this.elements.colorAddPopup;
        if (!popup || popup.style.display === 'none') return;

        popup.classList.add('fade-out');
        setTimeout(() => {
            popup.style.display = 'none';
            popup.classList.remove('fade-out');
        }, 120);
    }

    /**
     * 验证颜色值
     */
    _isValidColor(color) {
        if (!color) return false;
        const s = new Option().style;
        s.color = color;
        return s.color !== '';
    }

    /**
     * 添加自定义颜色
     */
    _addCustomColor(color) {
        if (!this._isValidColor(color)) {
            this._showToast('无效的颜色值', 'error');
            return;
        }

        // 生成唯一名称
        const name = 'custom-' + Date.now();

        // 添加到颜色列表
        this.highlightColors[name] = color;

        // 创建新的颜色点
        const picker = this.elements.highlightPicker;
        const addBtn = picker.querySelector('.highlight-add');
        const dot = document.createElement('div');
        dot.className = 'highlight-dot';
        dot.dataset.color = name;
        dot.style.background = color;
        dot.title = '自定义颜色 (长按删除)';
        picker.insertBefore(dot, addBtn);

        // 选中新颜色
        this._setHighlightColor(name);

        // 保存到 localStorage
        this._saveCustomColors();

        // 关闭弹窗
        this._hideColorHint();

        // 提示
        this._showToast('颜色已添加');
    }

    /**
     * 保存自定义颜色到 localStorage
     */
    _saveCustomColors() {
        const customColors = {};
        Object.keys(this.highlightColors).forEach(key => {
            if (key.startsWith('custom-')) {
                customColors[key] = this.highlightColors[key];
            }
        });
        localStorage.setItem('mditor-custom-colors', JSON.stringify(customColors));
    }

    /**
     * 从 localStorage 加载自定义颜色
     */
    _loadCustomColors() {
        try {
            const saved = localStorage.getItem('mditor-custom-colors');
            if (!saved) {
                return;
            }

            const customColors = JSON.parse(saved);

            const picker = this.elements.highlightPicker;
            if (!picker) {
                console.warn('[Highlight] 颜色选择器元素未找到，无法加载自定义颜色');
                return;
            }

            const addBtn = picker.querySelector('.highlight-add');

            Object.entries(customColors).forEach(([name, color]) => {
                // 添加到颜色列表
                this.highlightColors[name] = color;

                // 创建颜色点
                const dot = document.createElement('div');
                dot.className = 'highlight-dot';
                dot.dataset.color = name;
                dot.style.background = color;
                dot.title = '自定义颜色 (长按删除)';
                picker.insertBefore(dot, addBtn);
            });
        } catch (e) {
            console.error('加载自定义颜色失败:', e);
        }
    }

    /**
     * 删除自定义颜色
     */
    _deleteCustomColor(colorName) {
        // 只能删除自定义颜色
        if (!colorName.startsWith('custom-')) {
            return;
        }

        // 从颜色列表中移除
        delete this.highlightColors[colorName];

        // 从 DOM 中移除
        const picker = this.elements.highlightPicker;
        const dot = picker.querySelector(`.highlight-dot[data-color="${colorName}"]`);
        if (dot) {
            dot.classList.add('deleting');
            setTimeout(() => {
                dot.remove();
            }, 300);
        }

        // 如果删除的是当前选中颜色，切换到默认颜色
        if (this.currentHighlightColor === colorName) {
            this._setHighlightColor('amber');
        }

        // 保存到 localStorage
        this._saveCustomColors();

        // 提示
        this._showToast('颜色已删除');
    }

    // ========== 阅读模式临时高亮 ==========

    /**
     * 阅读模式：处理文字选择
     */
    _handleReadModeSelection() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            return;
        }

        const range = selection.getRangeAt(0);
        const selectedText = range.toString().trim();

        // 没有选中文字，隐藏触发图标
        if (!selectedText || range.collapsed) {
            this._hideHighlightTrigger();
            this._hideHighlightPicker();
            this._currentSelectionRange = null;
            return;
        }

        // 确保选区在内容区域内
        const contentArea = this.elements.content;
        if (!contentArea) {
            return;
        }

        // 修复：检查选区是否在内容区域内（支持跨元素选择，包括标题）
        // 检查 startContainer 和 endContainer 是否都在 contentArea 内
        const startInContent = contentArea.contains(range.startContainer);
        const endInContent = contentArea.contains(range.endContainer);
        const commonInContent = contentArea.contains(range.commonAncestorContainer) ||
                                range.commonAncestorContainer === contentArea;

        if (!startInContent || !endInContent || !commonInContent) {
            return;
        }

        // 保存当前选区（克隆以防被后续操作影响）
        this._currentSelectionRange = range.cloneRange();

        // 显示触发图标（不展开颜色选择器）
        this._showHighlightTrigger(range);
    }

    /**
     * 阅读模式：切换临时高亮（Ctrl+H 触发）
     */
    _toggleReadModeHighlight() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);

        // 只处理有选中文本的情况
        if (!range.collapsed && range.toString().trim()) {
            this._applyReadModeHighlight(range);
            this._showHighlightPickerForReadMode(range);
        }
    }

    /**
     * 阅读模式：应用临时高亮
     */
    _applyReadModeHighlight(range, color = this.currentHighlightColor) {
        try {
            // 检查 Range 是否有效
            if (!range || range.collapsed) {
                console.warn('无效的 Range 对象');
                return;
            }

            // 确保选区在 content-area 内
            const contentArea = this.elements.content;
            if (!contentArea) {
                console.warn('内容区域不存在');
                return;
            }

            // 修复：更完善的选区检查（支持标题等跨元素选择）
            const startInContent = contentArea.contains(range.startContainer);
            const endInContent = contentArea.contains(range.endContainer);
            const commonInContent = contentArea.contains(range.commonAncestorContainer) ||
                                    range.commonAncestorContainer === contentArea;

            if (!startInContent || !endInContent || !commonInContent) {
                console.warn('选区不在内容区域内', {
                    startInContent,
                    endInContent,
                    commonInContent,
                    commonAncestor: range.commonAncestorContainer.nodeName
                });
                return;
            }

            // 保存选区信息
            const selectedText = range.toString();
            if (!selectedText.trim()) {
                console.warn('选区文本为空');
                return;
            }

            // Bug 3 修复：检查选区是否在现有高亮内
            const findParentMark = (node) => {
                while (node && node !== contentArea) {
                    if (node.nodeType === Node.ELEMENT_NODE &&
                        node.tagName === 'MARK' &&
                        node.classList.contains('temp-highlight')) {
                        return node;
                    }
                    node = node.parentNode;
                }
                return null;
            };

            const startMark = findParentMark(range.startContainer);
            const endMark = findParentMark(range.endContainer);

            // 如果选区完全在同一个 mark 内，直接更新颜色
            if (startMark && startMark === endMark) {
                startMark.dataset.highlightColor = color;
                this._applyHighlightColor(startMark, color);
                window.getSelection()?.removeAllRanges();
                // 保存最近修改的标记
                this._lastCreatedMark = startMark;
                // 标记高亮已修改
                this._highlightsModified = true;
                return;
            }

            // 修复：先展开选区涉及的所有现有高亮，避免嵌套
            // 1. 找出所有与选区相交的 mark 元素
            const marksToUnwrap = new Set();

            // 检查 startContainer 和 endContainer 的父级 mark
            if (startMark) marksToUnwrap.add(startMark);
            if (endMark) marksToUnwrap.add(endMark);

            // 检查选区内的所有 mark
            const treeWalker = document.createTreeWalker(
                range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
                    ? range.commonAncestorContainer
                    : range.commonAncestorContainer.parentNode,
                NodeFilter.SHOW_ELEMENT,
                {
                    acceptNode: (node) => {
                        if (node.tagName === 'MARK' && node.classList.contains('temp-highlight')) {
                            return NodeFilter.FILTER_ACCEPT;
                        }
                        return NodeFilter.FILTER_SKIP;
                    }
                }
            );

            let currentNode;
            while (currentNode = treeWalker.nextNode()) {
                if (range.intersectsNode(currentNode)) {
                    marksToUnwrap.add(currentNode);
                }
            }

            // 2. 在展开 mark 之前，保存选区的完整信息
            // 保存选区文本用于后续验证
            const savedText = range.toString();

            // 计算选区起点在父容器中的文本偏移量
            const getTextOffset = (container, offset) => {
                const parent = container.nodeType === Node.TEXT_NODE ? container.parentNode : container;
                let textOffset = 0;

                // 遍历父节点的所有子节点，累计到目标位置的文本长度
                const walker = document.createTreeWalker(
                    parent,
                    NodeFilter.SHOW_TEXT,
                    null
                );

                let node;
                while (node = walker.nextNode()) {
                    if (node === container) {
                        textOffset += offset;
                        break;
                    } else if (container.nodeType === Node.ELEMENT_NODE && parent === container) {
                        // 如果 container 是元素节点，计算到指定子节点的偏移
                        const childNodes = Array.from(container.childNodes);
                        let currentOffset = 0;
                        for (let i = 0; i < offset && i < childNodes.length; i++) {
                            const child = childNodes[i];
                            if (child.nodeType === Node.TEXT_NODE) {
                                currentOffset += child.textContent.length;
                            } else {
                                currentOffset += child.textContent.length;
                            }
                        }
                        textOffset = currentOffset;
                        break;
                    } else {
                        textOffset += node.textContent.length;
                    }
                }

                return { parent, textOffset };
            };

            const startInfo = getTextOffset(range.startContainer, range.startOffset);
            const endInfo = getTextOffset(range.endContainer, range.endOffset);

            // 如果起点和终点在不同的父元素，使用共同祖先
            let commonParent = range.commonAncestorContainer;
            if (commonParent.nodeType === Node.TEXT_NODE) {
                commonParent = commonParent.parentNode;
            }

            // 3. 展开所有相关的 mark
            marksToUnwrap.forEach(mark => {
                const parent = mark.parentNode;
                if (!parent) return;

                // 展开 mark
                while (mark.firstChild) {
                    parent.insertBefore(mark.firstChild, mark);
                }
                parent.removeChild(mark);
            });

            // 合并所有受影响的父节点中的文本节点
            const parentsToNormalize = new Set();
            parentsToNormalize.add(commonParent);
            if (startInfo.parent !== commonParent) parentsToNormalize.add(startInfo.parent);
            if (endInfo.parent !== commonParent) parentsToNormalize.add(endInfo.parent);
            parentsToNormalize.forEach(p => p.normalize());

            // 4. 基于保存的文本内容重新创建选区
            // 在 commonParent 中查找匹配的文本
            const findTextRange = (parent, targetText) => {
                const fullText = parent.textContent;
                const startIndex = fullText.indexOf(targetText);

                if (startIndex === -1) {
                    console.warn('无法找到选区文本:', targetText.substring(0, 50));
                    console.warn('父元素:', parent.nodeName, '全文前100字符:', fullText.substring(0, 100));
                    console.warn('目标文本长度:', targetText.length, '父元素文本长度:', fullText.length);
                    return null;
                }

                const endIndex = startIndex + targetText.length;
                const newRange = document.createRange();

                // 遍历文本节点找到对应位置
                const walker = document.createTreeWalker(
                    parent,
                    NodeFilter.SHOW_TEXT,
                    null
                );

                let currentOffset = 0;
                let startSet = false;
                let node;

                while (node = walker.nextNode()) {
                    const nodeLength = node.textContent.length;
                    const nodeEnd = currentOffset + nodeLength;

                    // 设置起点
                    if (!startSet && currentOffset <= startIndex && startIndex < nodeEnd) {
                        newRange.setStart(node, startIndex - currentOffset);
                        startSet = true;
                    }

                    // 设置终点
                    if (startSet && currentOffset < endIndex && endIndex <= nodeEnd) {
                        newRange.setEnd(node, endIndex - currentOffset);
                        return newRange;
                    }

                    currentOffset = nodeEnd;
                }

                return null;
            };

            const newRange = findTextRange(commonParent, savedText);
            if (!newRange) {
                console.error('无法重新创建选区，commonParent:', commonParent.nodeName);
                return;
            }

            // 5. 创建并应用新高亮
            // 修复：检测是否跨块级元素，分别处理
            const blockElements = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'DIV', 'BLOCKQUOTE', 'PRE', 'UL', 'OL'];

            const isBlockElement = (node) => {
                return node.nodeType === Node.ELEMENT_NODE &&
                       blockElements.includes(node.tagName);
            };

            const getBlockParent = (node) => {
                while (node && node !== contentArea) {
                    if (isBlockElement(node)) return node;
                    node = node.parentNode;
                }
                return null;
            };

            const startBlock = getBlockParent(newRange.startContainer);
            const endBlock = getBlockParent(newRange.endContainer);

            // 检查是否跨块级元素
            if (startBlock !== endBlock) {
                // 跨块级元素，需要对每个涉及的文本节点分别应用高亮
                const textNodes = [];
                const walker = document.createTreeWalker(
                    commonParent,
                    NodeFilter.SHOW_TEXT,
                    {
                        acceptNode: (node) => {
                            // 只接受在选区内的文本节点
                            if (newRange.intersectsNode(node) && node.textContent.trim()) {
                                return NodeFilter.FILTER_ACCEPT;
                            }
                            return NodeFilter.FILTER_SKIP;
                        }
                    }
                );

                let node;
                while (node = walker.nextNode()) {
                    textNodes.push(node);
                }

                // 按块级父元素分组处理
                const processedBlocks = new Set();
                let firstMark = null;

                for (const textNode of textNodes) {
                    const blockParent = getBlockParent(textNode);
                    if (!blockParent || processedBlocks.has(blockParent)) {
                        continue;
                    }

                    // 创建一个范围来包含该块内的选中部分
                    const blockRange = document.createRange();

                    // 找到该块内第一个和最后一个相关的文本节点
                    const nodesInBlock = textNodes.filter(n => getBlockParent(n) === blockParent);

                    if (nodesInBlock.length === 0) continue;

                    const firstNodeInBlock = nodesInBlock[0];
                    const lastNodeInBlock = nodesInBlock[nodesInBlock.length - 1];

                    // 设置范围的起点
                    if (firstNodeInBlock === newRange.startContainer) {
                        blockRange.setStart(firstNodeInBlock, newRange.startOffset);
                    } else {
                        blockRange.setStart(firstNodeInBlock, 0);
                    }

                    // 设置范围的终点
                    if (lastNodeInBlock === newRange.endContainer) {
                        blockRange.setEnd(lastNodeInBlock, newRange.endOffset);
                    } else {
                        blockRange.setEnd(lastNodeInBlock, lastNodeInBlock.textContent.length);
                    }

                    // 在该块内应用高亮
                    const mark = document.createElement('mark');
                    mark.className = 'temp-highlight';
                    mark.dataset.highlightColor = color;
                    this._applyHighlightColor(mark, color);

                    try {
                        blockRange.surroundContents(mark);

                        if (!firstMark) {
                            firstMark = mark;
                        }
                    } catch (e) {
                        console.warn('块级元素', blockParent.tagName, '高亮失败:', e.message);
                        // 如果 surroundContents 失败，尝试逐个文本节点包裹
                        for (const node of nodesInBlock) {
                            try {
                                const singleRange = document.createRange();

                                if (node === newRange.startContainer && node === newRange.endContainer) {
                                    singleRange.setStart(node, newRange.startOffset);
                                    singleRange.setEnd(node, newRange.endOffset);
                                } else if (node === newRange.startContainer) {
                                    singleRange.setStart(node, newRange.startOffset);
                                    singleRange.setEnd(node, node.textContent.length);
                                } else if (node === newRange.endContainer) {
                                    singleRange.setStart(node, 0);
                                    singleRange.setEnd(node, newRange.endOffset);
                                } else {
                                    singleRange.selectNodeContents(node);
                                }

                                const nodeMark = document.createElement('mark');
                                nodeMark.className = 'temp-highlight';
                                nodeMark.dataset.highlightColor = color;
                                this._applyHighlightColor(nodeMark, color);

                                singleRange.surroundContents(nodeMark);

                                if (!firstMark) {
                                    firstMark = nodeMark;
                                }
                            } catch (e2) {
                                console.error('单个文本节点包裹失败:', e2.message);
                            }
                        }
                    }

                    processedBlocks.add(blockParent);
                }

                // 保存第一个创建的标记
                this._lastCreatedMark = firstMark;

            } else {
                // 同一块级元素内，使用原有逻辑
                const mark = document.createElement('mark');
                mark.className = 'temp-highlight';
                mark.dataset.highlightColor = color;
                this._applyHighlightColor(mark, color);

                try {
                    newRange.surroundContents(mark);
                } catch (e) {
                    // 跨元素选择时使用 extractContents
                    try {
                        const fragment = newRange.extractContents();
                        mark.appendChild(fragment);
                        newRange.insertNode(mark);
                    } catch (e2) {
                        console.error('extractContents 也失败:', e2.message);
                        throw e2;
                    }
                }

                // 保存最近创建的标记（用于颜色更新）
                this._lastCreatedMark = mark;
            }

            // 清除选区
            window.getSelection()?.removeAllRanges();

            // 标记高亮已修改
            this._highlightsModified = true;

        } catch (error) {
            console.error('应用阅读模式高亮失败:', error);
        }
    }

    /**
     * 阅读模式：移除临时高亮
     */
    _removeReadModeHighlight(markElement) {
        if (!markElement || markElement.tagName !== 'MARK') return;

        // 如果删除的是最近创建的标记，清除引用
        if (this._lastCreatedMark === markElement) {
            this._lastCreatedMark = null;
        }

        // 将 mark 的内容替换回父节点
        const parent = markElement.parentNode;
        if (!parent) return;

        while (markElement.firstChild) {
            parent.insertBefore(markElement.firstChild, markElement);
        }
        parent.removeChild(markElement);

        // 合并相邻的文本节点
        parent.normalize();

        // 标记高亮已修改
        this._highlightsModified = true;
    }

    /**
     * 显示高亮触发图标
     */
    _showHighlightTrigger(range) {
        const trigger = this.elements.highlightTrigger;
        if (!trigger) return;

        // 清除之前的定时器
        if (this.highlightTriggerTimer) {
            clearTimeout(this.highlightTriggerTimer);
        }

        // 获取选区位置（支持跨块级元素选择）
        let rect = range.getBoundingClientRect();

        // 如果 getBoundingClientRect 返回空矩形，尝试使用 getClientRects
        if (!rect || (rect.width === 0 && rect.height === 0)) {
            const rects = range.getClientRects();
            if (rects && rects.length > 0) {
                // 使用最后一个矩形（选区末尾）来定位触发图标
                rect = rects[rects.length - 1];
            }
        }

        if (!rect || (rect.width === 0 && rect.height === 0)) {
            return;
        }

        // 定位到选区右上角
        trigger.style.display = 'flex';
        trigger.classList.remove('fade-out');

        const viewportWidth = window.innerWidth;

        // 计算位置
        let left = rect.right + 4;
        let top = rect.top + window.scrollY - 12;

        // 边界检查
        if (left + 24 > viewportWidth - 10) {
            left = rect.left - 28; // 放到左侧
        }
        if (top < 10) {
            top = rect.bottom + window.scrollY + 4; // 放到下方
        }

        trigger.style.left = `${left}px`;
        trigger.style.top = `${top}px`;

        // 使用当前高亮颜色
        const colorMap = {
            'amber': 'rgba(251, 191, 36, 1)',
            'emerald': 'rgba(52, 211, 153, 1)',
            'sky': 'rgba(56, 189, 248, 1)',
            'rose': 'rgba(251, 113, 133, 1)',
            'violet': 'rgba(167, 139, 250, 1)',
        };
        const color = colorMap[this.currentHighlightColor] || this.highlightColors?.[this.currentHighlightColor] || colorMap['amber'];
        trigger.style.color = color;

        this.highlightTriggerVisible = true;
    }

    /**
     * 隐藏高亮触发图标
     */
    _hideHighlightTrigger() {
        const trigger = this.elements.highlightTrigger;
        if (!trigger) return;

        // 清理定时器
        if (this.highlightTriggerTimer) {
            clearTimeout(this.highlightTriggerTimer);
            this.highlightTriggerTimer = null;
        }

        trigger.classList.add('fade-out');
        setTimeout(() => {
            trigger.style.display = 'none';
            trigger.classList.remove('fade-out');
        }, 150);

        this.highlightTriggerVisible = false;
    }

    /**
     * 阅读模式：显示颜色选择器
     * 关键：第一个颜色点要对齐小圆点位置，这样双击不用挪鼠标
     */
    _showHighlightPickerForReadMode(range) {
        const picker = this.elements.highlightPicker;
        const trigger = this.elements.highlightTrigger;
        if (!picker) return;

        // 确保 picker 事件已绑定（与 edit mode 共用）
        this._ensurePickerEventsBound(picker);

        // 获取小圆点的中心位置（展开后第一个颜色要对齐这里）
        const triggerRect = trigger?.getBoundingClientRect();
        const triggerCenterX = triggerRect ? triggerRect.left + triggerRect.width / 2 : null;
        const triggerCenterY = triggerRect ? triggerRect.top + triggerRect.height / 2 : null;

        // 隐藏触发图标
        this._hideHighlightTrigger();

        // 清除之前的定时器
        if (this.highlightPickerTimer) {
            clearTimeout(this.highlightPickerTimer);
        }

        // 定位到选区上方
        picker.style.display = 'flex';
        picker.classList.remove('fade-out');

        const pickerRect = picker.getBoundingClientRect();
        const viewportWidth = window.innerWidth;

        // 第一个颜色点中心相对于 picker 左边缘的偏移: padding(12) + 半径(8) = 20px
        const firstDotOffset = 20;

        let left, top;

        if (triggerCenterX !== null && triggerCenterY !== null) {
            // 让第一个颜色点对齐小圆点原位置
            left = triggerCenterX - firstDotOffset;
            top = triggerCenterY - pickerRect.height / 2 + window.scrollY;
        } else {
            // fallback: 基于选区定位
            const rect = range.getBoundingClientRect();
            left = rect.left + rect.width / 2 - pickerRect.width / 2;
            top = rect.top + window.scrollY - 40;
        }

        // 边界检查
        if (left < 10) left = 10;
        if (left + pickerRect.width > viewportWidth - 10) {
            left = viewportWidth - pickerRect.width - 10;
        }
        if (top < 10) top = 10;

        picker.style.left = `${left}px`;
        picker.style.top = `${top}px`;

        // 标记当前颜色
        picker.querySelectorAll('.highlight-dot').forEach(dot => {
            dot.classList.toggle('active', dot.dataset.color === this.currentHighlightColor);
        });

        this.highlightPickerVisible = true;

        // 2秒后自动隐藏
        this.highlightPickerTimer = setTimeout(() => {
            this._hideHighlightPicker();
        }, 2000);

        // 保存当前高亮范围（用于后续颜色更新）
        this._lastHighlightRange = range;
    }

    /**
     * 更新最近添加的高亮颜色
     */
    _updateLastReadModeHighlight(color) {
        // 使用最近创建或修改的标记
        if (this._lastCreatedMark && this._lastCreatedMark.parentNode) {
            this._lastCreatedMark.dataset.highlightColor = color;
            this._applyHighlightColor(this._lastCreatedMark, color);
            // 标记高亮已修改
            this._highlightsModified = true;
        } else {
            // 降级方案：查找最近添加的高亮（DOM 顺序的最后一个）
            const allMarks = this.elements.content?.querySelectorAll('mark.temp-highlight');
            if (allMarks && allMarks.length > 0) {
                const lastMark = allMarks[allMarks.length - 1];
                lastMark.dataset.highlightColor = color;
                this._applyHighlightColor(lastMark, color);
                this._lastCreatedMark = lastMark;
                // 标记高亮已修改
                this._highlightsModified = true;
            }
        }
    }

    /**
     * 应用高亮颜色样式（Bug 4 修复：暗色模式优化）
     */
    _applyHighlightColor(element, colorName) {
        // Bug 4 修复：提高颜色不透明度，暗色模式下更明显
        const colorMap = {
            'amber': 'rgba(251, 191, 36, 0.5)',
            'emerald': 'rgba(52, 211, 153, 0.5)',
            'sky': 'rgba(56, 189, 248, 0.45)',
            'rose': 'rgba(251, 113, 133, 0.45)',
            'violet': 'rgba(167, 139, 250, 0.5)',
        };

        // 修复：优先使用新的 colorMap，然后是自定义颜色，最后是默认 amber
        const color = colorMap[colorName] || this.highlightColors?.[colorName] || colorMap['amber'];
        element.style.background = color;
    }

    /**
     * 清除所有阅读模式临时高亮
     */
    _clearAllReadModeHighlights() {
        const allMarks = this.elements.content?.querySelectorAll('mark.temp-highlight');
        if (allMarks) {
            allMarks.forEach(mark => {
                this._removeReadModeHighlight(mark);
            });
        }
        // 清除最近创建的标记引用
        this._lastCreatedMark = null;
    }

    /**
     * 保存当前的高亮信息（切换到编辑模式前）
     */
    _saveHighlights() {
        this._savedHighlights = [];
        const contentArea = this.elements.content;
        if (!contentArea) return;

        const allMarks = contentArea.querySelectorAll('mark.temp-highlight');
        if (!allMarks || allMarks.length === 0) return;

        // 获取所有文本节点的文本内容，用于计算偏移量
        const getTextContent = (node) => {
            let text = '';
            const walker = document.createTreeWalker(
                node,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );
            let textNode;
            while (textNode = walker.nextNode()) {
                text += textNode.textContent;
            }
            return text;
        };

        // 计算节点在文档中的文本偏移量
        const getTextOffset = (targetNode) => {
            let offset = 0;
            const walker = document.createTreeWalker(
                contentArea,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );

            let currentNode;
            while (currentNode = walker.nextNode()) {
                if (currentNode === targetNode) {
                    break;
                }
                offset += currentNode.textContent.length;
            }
            return offset;
        };

        // 遍历所有高亮标记
        allMarks.forEach(mark => {
            try {
                const text = mark.textContent;
                const color = mark.dataset.highlightColor || 'amber';

                // 获取高亮开始位置的文本偏移量
                const firstTextNode = document.createTreeWalker(
                    mark,
                    NodeFilter.SHOW_TEXT,
                    null,
                    false
                ).nextNode();

                if (firstTextNode) {
                    const offset = getTextOffset(firstTextNode);

                    this._savedHighlights.push({
                        text: text,
                        color: color,
                        offset: offset,
                        length: text.length
                    });
                }
            } catch (error) {
                console.error('保存高亮失败:', error);
            }
        });
    }

    /**
     * 恢复之前保存的高亮（切换回阅读模式后）
     */
    _restoreHighlights() {
        if (!this._savedHighlights || this._savedHighlights.length === 0) {
            return;
        }

        const contentArea = this.elements.content;
        if (!contentArea) return;

        // 创建文本节点 walker
        const walker = document.createTreeWalker(
            contentArea,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        // 构建文本节点数组和偏移量映射
        const textNodes = [];
        const nodeOffsets = [];
        let currentOffset = 0;

        let textNode;
        while (textNode = walker.nextNode()) {
            textNodes.push(textNode);
            nodeOffsets.push(currentOffset);
            currentOffset += textNode.textContent.length;
        }

        // 恢复每个高亮
        this._savedHighlights.forEach(highlight => {
            try {
                const { text, color, offset, length } = highlight;

                // 查找包含起始偏移的文本节点
                let startNodeIndex = -1;
                let startNodeOffset = 0;

                for (let i = 0; i < nodeOffsets.length; i++) {
                    if (offset >= nodeOffsets[i]) {
                        const nodeEnd = nodeOffsets[i] + textNodes[i].textContent.length;
                        if (offset < nodeEnd) {
                            startNodeIndex = i;
                            startNodeOffset = offset - nodeOffsets[i];
                            break;
                        }
                    }
                }

                if (startNodeIndex === -1) {
                    console.warn('未找到起始节点，偏移:', offset);
                    return;
                }

                // 创建 Range
                const range = document.createRange();
                const startNode = textNodes[startNodeIndex];
                range.setStart(startNode, startNodeOffset);

                // 查找结束位置
                let remainingLength = length;
                let currentNodeIndex = startNodeIndex;
                let endNodeOffset = startNodeOffset;

                while (remainingLength > 0 && currentNodeIndex < textNodes.length) {
                    const currentNode = textNodes[currentNodeIndex];
                    const availableLength = currentNode.textContent.length - endNodeOffset;

                    if (remainingLength <= availableLength) {
                        endNodeOffset += remainingLength;
                        remainingLength = 0;
                    } else {
                        remainingLength -= availableLength;
                        currentNodeIndex++;
                        endNodeOffset = 0;
                    }
                }

                if (remainingLength > 0) {
                    console.warn('文本长度不足，可能内容已改变');
                    return;
                }

                range.setEnd(textNodes[currentNodeIndex], endNodeOffset);

                // 验证文本是否匹配
                const rangeText = range.toString();
                if (rangeText !== text) {
                    console.warn('文本不匹配，尝试模糊匹配:', {
                        expected: text.substring(0, 30),
                        actual: rangeText.substring(0, 30)
                    });

                    // 如果文本不完全匹配，尝试在附近查找
                    if (!this._findAndHighlightText(text, color, offset)) {
                        console.warn('无法恢复高亮:', text.substring(0, 30));
                        return;
                    }
                } else {
                    // 文本匹配，应用高亮
                    this._applyReadModeHighlight(range, color);
                }

            } catch (error) {
                console.error('恢复高亮失败:', error);
            }
        });

        // 清空保存的高亮
        this._savedHighlights = [];
    }

    /**
     * 在内容区域中查找文本并应用高亮（用于模糊匹配）
     */
    _findAndHighlightText(text, color, preferredOffset) {
        const contentArea = this.elements.content;
        if (!contentArea) return false;

        const contentText = contentArea.textContent;

        // 首先尝试在期望位置附近查找
        const searchStart = Math.max(0, preferredOffset - 100);
        const searchEnd = Math.min(contentText.length, preferredOffset + text.length + 100);
        const searchText = contentText.substring(searchStart, searchEnd);

        let index = searchText.indexOf(text);
        if (index === -1) {
            // 在附近没找到，尝试全文搜索
            index = contentText.indexOf(text);
            if (index === -1) {
                return false;
            }
        } else {
            index += searchStart;
        }

        // 找到了文本，创建 Range
        try {
            const walker = document.createTreeWalker(
                contentArea,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );

            let currentOffset = 0;
            let textNode;

            while (textNode = walker.nextNode()) {
                const nodeLength = textNode.textContent.length;
                const nodeEnd = currentOffset + nodeLength;

                if (index >= currentOffset && index < nodeEnd) {
                    // 找到起始节点
                    const range = document.createRange();
                    const startOffset = index - currentOffset;
                    range.setStart(textNode, startOffset);

                    // 设置结束位置
                    let remainingLength = text.length - (nodeLength - startOffset);
                    if (remainingLength <= 0) {
                        // 在同一节点内
                        range.setEnd(textNode, startOffset + text.length);
                    } else {
                        // 跨越多个节点
                        range.setEnd(textNode, nodeLength);
                        let nextNode;
                        while ((nextNode = walker.nextNode()) && remainingLength > 0) {
                            const nextLength = nextNode.textContent.length;
                            if (remainingLength <= nextLength) {
                                range.setEnd(nextNode, remainingLength);
                                remainingLength = 0;
                            } else {
                                remainingLength -= nextLength;
                            }
                        }
                    }

                    this._applyReadModeHighlight(range, color);
                    return true;
                }

                currentOffset = nodeEnd;
            }
        } catch (error) {
            console.error('模糊匹配失败:', error);
        }

        return false;
    }

    // ========== 高亮持久化 ==========

    /**
     * 生成文件路径的哈希值
     */
    _hashFilePath(filePath) {
        if (!filePath) return 'default';
        let hash = 0;
        for (let i = 0; i < filePath.length; i++) {
            const char = filePath.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * 保存高亮到 localStorage（持久化）
     */
    _saveHighlightsToPersistence() {
        if (!this.currentFilePath) {
            return;
        }

        const highlights = [];
        const contentArea = this.elements.content;
        if (!contentArea) return;

        const allMarks = contentArea.querySelectorAll('mark.temp-highlight');
        if (!allMarks || allMarks.length === 0) {
            // 清空该文件的高亮数据
            const key = 'mditor-highlights-' + this._hashFilePath(this.currentFilePath);
            localStorage.removeItem(key);
            return;
        }

        // 计算节点在文档中的文本偏移量
        const getTextOffset = (targetNode) => {
            let offset = 0;
            const walker = document.createTreeWalker(
                contentArea,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );

            let currentNode;
            while (currentNode = walker.nextNode()) {
                if (currentNode === targetNode) {
                    break;
                }
                offset += currentNode.textContent.length;
            }
            return offset;
        };

        // 遍历所有高亮标记
        allMarks.forEach(mark => {
            try {
                const text = mark.textContent;
                const color = mark.dataset.highlightColor || 'amber';

                // 获取高亮开始位置的文本偏移量
                const firstTextNode = document.createTreeWalker(
                    mark,
                    NodeFilter.SHOW_TEXT,
                    null,
                    false
                ).nextNode();

                if (firstTextNode) {
                    const offset = getTextOffset(firstTextNode);
                    highlights.push({
                        text: text,
                        color: color,
                        offset: offset,
                        length: text.length
                    });
                }
            } catch (error) {
                console.error('保存高亮失败:', error);
            }
        });

        const key = 'mditor-highlights-' + this._hashFilePath(this.currentFilePath);
        const data = {
            filePath: this.currentFilePath,
            highlights: highlights,
            timestamp: Date.now()
        };

        localStorage.setItem(key, JSON.stringify(data));

        // 保存后标记为未修改
        this._highlightsModified = false;
    }

    /**
     * 从 localStorage 加载高亮（持久化）
     */
    _loadHighlightsFromPersistence() {
        if (!this.currentFilePath) {
            return;
        }

        const key = 'mditor-highlights-' + this._hashFilePath(this.currentFilePath);
        const dataStr = localStorage.getItem(key);

        if (!dataStr) {
            return;
        }

        try {
            const data = JSON.parse(dataStr);
            const highlights = data.highlights;

            if (!highlights || highlights.length === 0) {
                return;
            }

            const contentArea = this.elements.content;
            if (!contentArea) return;

            // 创建文本节点 walker
            const walker = document.createTreeWalker(
                contentArea,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );

            // 构建文本节点数组和偏移量映射
            const textNodes = [];
            const nodeOffsets = [];
            let currentOffset = 0;

            let textNode;
            while (textNode = walker.nextNode()) {
                textNodes.push(textNode);
                nodeOffsets.push(currentOffset);
                currentOffset += textNode.textContent.length;
            }

            // 恢复每个高亮
            highlights.forEach(highlight => {
                try {
                    const { text, color, offset, length } = highlight;

                    // 查找包含起始偏移的文本节点
                    let startNodeIndex = -1;
                    let startNodeOffset = 0;

                    for (let i = 0; i < nodeOffsets.length; i++) {
                        if (offset >= nodeOffsets[i]) {
                            const nodeEnd = nodeOffsets[i] + textNodes[i].textContent.length;
                            if (offset < nodeEnd) {
                                startNodeIndex = i;
                                startNodeOffset = offset - nodeOffsets[i];
                                break;
                            }
                        }
                    }

                    if (startNodeIndex === -1) {
                        console.warn('未找到起始节点，偏移:', offset);
                        return;
                    }

                    // 创建 Range
                    const range = document.createRange();
                    const startNode = textNodes[startNodeIndex];
                    range.setStart(startNode, startNodeOffset);

                    // 查找结束位置
                    let remainingLength = length;
                    let currentNodeIndex = startNodeIndex;
                    let endNodeOffset = startNodeOffset;

                    while (remainingLength > 0 && currentNodeIndex < textNodes.length) {
                        const currentNode = textNodes[currentNodeIndex];
                        const availableLength = currentNode.textContent.length - endNodeOffset;

                        if (remainingLength <= availableLength) {
                            endNodeOffset += remainingLength;
                            remainingLength = 0;
                        } else {
                            remainingLength -= availableLength;
                            currentNodeIndex++;
                            endNodeOffset = 0;
                        }
                    }

                    if (remainingLength > 0) {
                        console.warn('文本长度不足，可能内容已改变');
                        return;
                    }

                    range.setEnd(textNodes[currentNodeIndex], endNodeOffset);

                    // 验证文本是否匹配
                    const rangeText = range.toString();
                    if (rangeText === text) {
                        // 文本匹配，应用高亮
                        this._applyReadModeHighlight(range, color);
                    } else {
                        console.warn('文本不匹配，跳过:', text.substring(0, 30));
                    }

                } catch (error) {
                    console.error('加载高亮失败:', error);
                }
            });

            // 加载后标记为未修改
            this._highlightsModified = false;
            // 清除最近创建的标记引用（因为这些是从持久化加载的，不是新创建的）
            this._lastCreatedMark = null;

        } catch (error) {
            console.error('解析高亮数据失败:', error);
        }
    }

    /**
     * 检查是否有未保存的高亮
     */
    _hasUnsavedHighlights() {
        // 如果没有修改标记，返回 false
        if (!this._highlightsModified) {
            return false;
        }

        // 检查是否有高亮存在
        const contentArea = this.elements.content;
        if (!contentArea) return false;

        const allMarks = contentArea.querySelectorAll('mark.temp-highlight');
        return allMarks && allMarks.length > 0;
    }

    /**
     * 显示保存确认对话框
     */
    _showSaveHighlightsDialog() {
        return new Promise((resolve) => {
            const dialog = document.getElementById('save-highlights-dialog');
            if (!dialog) {
                resolve('cancel');
                return;
            }

            dialog.style.display = 'flex';

            // 处理按钮点击
            const handleClick = (action) => {
                dialog.style.display = 'none';
                dialog.removeEventListener('click', clickHandler);
                resolve(action);
            };

            const clickHandler = (e) => {
                const btn = e.target.closest('[data-action]');
                if (btn) {
                    const action = btn.dataset.action;
                    handleClick(action);
                }
            };

            dialog.addEventListener('click', clickHandler);
        });
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
                    e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
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
        this.slashMenuExpanded = false;
        this.slashCommands = this.slashQuickCommands;
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

        if (this.slashMenuExpanded) {
            // 展开模式：显示分组
            this._renderExpandedMenu(list);
        } else {
            // 快捷模式：显示快捷命令 + 查看全部
            this._renderQuickMenu(list);
        }
    }

    /**
     * 渲染快捷菜单
     */
    _renderQuickMenu(list) {
        let html = this.slashQuickCommands.map((cmd, i) => `
            <div class="slash-menu-item${i === this.slashMenuIndex ? ' active' : ''}" data-i="${i}">
                <span class="slash-menu-icon">${cmd.icon}</span>
                <span class="slash-menu-label">${cmd.label}</span>
                <span class="slash-menu-hint">${cmd.hint}</span>
            </div>
        `).join('');

        // 添加分割线和「查看全部」
        html += `
            <div class="slash-menu-divider"></div>
            <div class="slash-menu-item slash-menu-expand${this.slashMenuIndex === this.slashQuickCommands.length ? ' active' : ''}" data-action="expand">
                <span class="slash-menu-label">查看全部</span>
                <span class="slash-menu-hint">→</span>
            </div>
        `;

        list.innerHTML = html;
        this._bindSlashMenuEvents(list);
    }

    /**
     * 渲染展开菜单（分组）
     */
    _renderExpandedMenu(list) {
        let html = `
            <div class="slash-menu-item slash-menu-back" data-action="back">
                <span class="slash-menu-icon">←</span>
                <span class="slash-menu-label">返回</span>
            </div>
            <div class="slash-menu-divider"></div>
        `;

        let globalIndex = 0;
        this.slashCommandGroups.forEach(group => {
            html += `<div class="slash-menu-group">
                <div class="slash-menu-group-name">${group.name}</div>
                <div class="slash-menu-group-items">`;

            group.commands.forEach(cmd => {
                html += `
                    <div class="slash-menu-chip${globalIndex === this.slashMenuIndex ? ' active' : ''}" data-i="${globalIndex}" title="${cmd.hint}">
                        ${cmd.icon}
                    </div>
                `;
                globalIndex++;
            });

            html += `</div></div>`;
        });

        list.innerHTML = html;
        this._bindSlashMenuEvents(list);
    }

    /**
     * 绑定菜单事件
     */
    _bindSlashMenuEvents(list) {
        // 点击命令项
        list.querySelectorAll('.slash-menu-item[data-i], .slash-menu-chip[data-i]').forEach(el => {
            el.addEventListener('click', () => this._execSlashCmd(+el.dataset.i));
        });

        // 点击「查看全部」
        list.querySelector('[data-action="expand"]')?.addEventListener('click', () => {
            this.slashMenuExpanded = true;
            this.slashMenuIndex = 0;
            // 更新命令列表为展开模式的平面列表
            this.slashCommands = this.slashCommandGroups.flatMap(g => g.commands);
            this._renderSlashMenu();
        });

        // 点击「返回」
        list.querySelector('[data-action="back"]')?.addEventListener('click', () => {
            this.slashMenuExpanded = false;
            this.slashMenuIndex = 0;
            this.slashCommands = this.slashQuickCommands;
            this._renderSlashMenu();
        });

        // 确保选中项可见
        const activeItem = list.querySelector('.slash-menu-item.active, .slash-menu-chip.active');
        if (activeItem) {
            activeItem.scrollIntoView({ block: 'nearest' });
        }
    }

    /**
     * 处理菜单导航
     */
    _handleSlashNavigation(key) {
        const maxIndex = this.slashMenuExpanded
            ? this.slashCommands.length - 1
            : this.slashQuickCommands.length;  // +1 for "查看全部"

        if (key === 'ArrowUp') {
            this.slashMenuIndex = Math.max(0, this.slashMenuIndex - 1);
            this._renderSlashMenu();
        } else if (key === 'ArrowDown') {
            this.slashMenuIndex = Math.min(maxIndex, this.slashMenuIndex + 1);
            this._renderSlashMenu();
        } else if (key === 'ArrowRight') {
            // 右箭头：展开「查看全部」
            if (!this.slashMenuExpanded) {
                this.slashMenuExpanded = true;
                this.slashMenuIndex = 0;
                this.slashCommands = this.slashCommandGroups.flatMap(g => g.commands);
                this._renderSlashMenu();
            }
        } else if (key === 'ArrowLeft') {
            // 左箭头：返回快捷模式
            if (this.slashMenuExpanded) {
                this.slashMenuExpanded = false;
                this.slashMenuIndex = 0;
                this.slashCommands = this.slashQuickCommands;
                this._renderSlashMenu();
            }
        } else if (key === 'Enter') {
            // 在快捷模式下，选中「查看全部」时展开
            if (!this.slashMenuExpanded && this.slashMenuIndex === this.slashQuickCommands.length) {
                this.slashMenuExpanded = true;
                this.slashMenuIndex = 0;
                this.slashCommands = this.slashCommandGroups.flatMap(g => g.commands);
                this._renderSlashMenu();
            } else {
                this._execSlashCmd(this.slashMenuIndex);
            }
        } else if (key === 'Escape') {
            if (this.slashMenuExpanded) {
                // 返回快捷模式
                this.slashMenuExpanded = false;
                this.slashMenuIndex = 0;
                this.slashCommands = this.slashQuickCommands;
                this._renderSlashMenu();
            } else {
                this._hideSlashMenu();
            }
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

    // ========== 设置面板 ==========

    /**
     * 初始化设置
     */
    async _initSettings() {
        this._bindSettingsEvents();
        this._applyFontSize();
        this._applyReaderFont();
        this._applyContentWidth();

        // 动态读取应用版本号
        if (this.elements.appVersion && window.electronAPI?.getAppVersion) {
            try {
                const version = await window.electronAPI.getAppVersion();
                if (version) {
                    this.elements.appVersion.textContent = `v${version}`;
                }
            } catch {
                // 保持默认文本
            }
        }
    }

    /**
     * 绑定设置事件
     */
    _bindSettingsEvents() {
        // 打开设置
        this.elements.settingsBtn?.addEventListener('click', () => {
            this._showSettings();
        });

        // 关闭设置
        this.elements.settingsClose?.addEventListener('click', () => {
            this._hideSettings();
        });

        this.elements.settingsOverlay?.addEventListener('click', () => {
            this._hideSettings();
        });

        // ESC 关闭设置
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.settingsVisible) {
                this._hideSettings();
            }
        });

        // 字号滑块
        this.elements.fontSizeSlider?.addEventListener('input', (e) => {
            this.fontSize = parseInt(e.target.value);
            this._updateFontSizeUI();
            this._applyFontSize();
            this._saveFontSize();
        });

        // 字号 +/- 按钮
        this.elements.fontSizeDec?.addEventListener('click', () => {
            if (this.fontSize > 12) {
                this.fontSize--;
                this._updateFontSizeUI();
                this._applyFontSize();
                this._saveFontSize();
            }
        });

        this.elements.fontSizeInc?.addEventListener('click', () => {
            if (this.fontSize < 24) {
                this.fontSize++;
                this._updateFontSizeUI();
                this._applyFontSize();
                this._saveFontSize();
            }
        });

        // 阅读字体切换（无衬线 / 衬线体）
        this.elements.fontFamilySegment?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-font]');
            if (!btn) return;
            this.readerFont = btn.dataset.font;
            localStorage.setItem('mditor-reader-font', this.readerFont);
            this._applyReaderFont();
        });

        // 版心宽度切换（窄 / 适中 / 宽）
        this.elements.contentWidthSegment?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-width]');
            if (!btn) return;
            this.contentWidth = btn.dataset.width;
            localStorage.setItem('mditor-content-width', this.contentWidth);
            this._applyContentWidth();
        });

        // 检查更新
        this.elements.checkUpdateBtn?.addEventListener('click', () => {
            this._checkForUpdates();
        });
    }

    /**
     * 显示设置面板
     */
    _showSettings() {
        this.settingsVisible = true;
        if (this.elements.settingsPanel) {
            this.elements.settingsPanel.style.display = 'flex';
        }
        this._updateFontSizeUI();
        this._updateTypographyUI();
    }

    /**
     * 隐藏设置面板
     */
    _hideSettings() {
        this.settingsVisible = false;
        if (this.elements.settingsPanel) {
            this.elements.settingsPanel.style.display = 'none';
        }
    }

    /**
     * 更新字号 UI
     */
    _updateFontSizeUI() {
        if (this.elements.fontSizeSlider) {
            this.elements.fontSizeSlider.value = this.fontSize;
        }
        if (this.elements.fontSizeValue) {
            this.elements.fontSizeValue.textContent = `${this.fontSize}px`;
        }
    }

    /**
     * 更新字体/版心分段按钮激活状态
     */
    _updateTypographyUI() {
        this.elements.fontFamilySegment?.querySelectorAll('[data-font]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.font === this.readerFont);
        });
        this.elements.contentWidthSegment?.querySelectorAll('[data-width]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.width === this.contentWidth);
        });
    }

    /**
     * 应用字号（同时作用于阅读与编辑模式）
     */
    _applyFontSize() {
        const px = `${this.fontSize}px`;
        document.documentElement.style.setProperty('--editor-font-size', px);
        document.documentElement.style.setProperty('--reader-font-size', px);

        // 如果编辑器已初始化，更新其样式
        if (this.editor?.view) {
            const scroller = this.elements.editorContainer?.querySelector('.cm-scroller');
            if (scroller) {
                scroller.style.fontSize = px;
            }
        }
    }

    /**
     * 应用阅读字体
     */
    _applyReaderFont() {
        const fontVar = this.readerFont === 'serif' ? 'var(--font-serif)' : 'var(--font-sans)';
        document.documentElement.style.setProperty('--reader-font-family', fontVar);
        this._updateTypographyUI();
    }

    /**
     * 应用版心宽度
     */
    _applyContentWidth() {
        const widthMap = {
            narrow: '680px',
            medium: '800px',
            wide: '960px'
        };
        const width = widthMap[this.contentWidth] || '800px';
        document.documentElement.style.setProperty('--content-max-width', width);
        this._updateTypographyUI();
    }

    /**
     * 保存字号设置
     */
    _saveFontSize() {
        localStorage.setItem('mditor-font-size', this.fontSize.toString());
    }

    /**
     * 检查更新
     */
    async _checkForUpdates() {
        const btn = this.elements.checkUpdateBtn;
        if (!btn) return;

        btn.classList.add('loading');
        btn.textContent = '检查中...';

        try {
            if (window.electronAPI?.checkForUpdates) {
                const result = await window.electronAPI.checkForUpdates();
                if (result.hasUpdate) {
                    btn.textContent = `发现新版本 ${result.version}`;
                    btn.onclick = () => {
                        window.electronAPI.openExternal(result.downloadUrl);
                    };
                } else {
                    btn.textContent = '已是最新版本';
                    setTimeout(() => {
                        btn.textContent = '检查更新';
                        btn.classList.remove('loading');
                    }, 2000);
                }
            } else {
                // 非 Electron 环境，打开 GitHub releases
                window.open('https://github.com/lookingatyou250-byte/mditor/releases', '_blank');
                btn.textContent = '检查更新';
                btn.classList.remove('loading');
            }
        } catch (e) {
            btn.textContent = '检查失败';
            btn.classList.remove('loading');
            setTimeout(() => {
                btn.textContent = '检查更新';
            }, 2000);
        }
    }

    // ========== 阅读进度条 / 灯箱 / 缩放 / 外部热刷新 / 页内搜索 ==========

    /**
     * 初始化顶部阅读进度条
     */
    _initReadingProgress() {
        this.elements.content?.addEventListener('scroll', () => {
            this._updateReadingProgress();
        }, { passive: true });
    }

    /**
     * 更新顶部阅读进度条
     */
    _updateReadingProgress() {
        const bar = this.elements.readingProgressBar;
        if (!bar) return;
        if (this.isEditMode || !this.elements.content) {
            bar.style.width = '0%';
            return;
        }
        const el = this.elements.content;
        const maxScroll = el.scrollHeight - el.clientHeight;
        const pct = maxScroll > 0 ? (el.scrollTop / maxScroll) * 100 : 0;
        bar.style.width = `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`;
    }

    /**
     * 初始化图片灯箱关闭交互
     */
    _initLightbox() {
        const lightbox = this.elements.imageLightbox;
        if (!lightbox) return;
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox || e.target.id === 'image-lightbox-caption') {
                this._closeLightbox();
            }
        });
    }

    _closeLightbox() {
        if (this.elements.imageLightbox) {
            this.elements.imageLightbox.style.display = 'none';
        }
    }

    /**
     * 初始化 Ctrl + 滚轮快速缩放字号
     */
    _initZoomShortcut() {
        window.addEventListener('wheel', (e) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            e.preventDefault();
            const delta = e.deltaY < 0 ? 1 : -1;
            const next = Math.max(12, Math.min(24, this.fontSize + delta));
            if (next !== this.fontSize) {
                this.fontSize = next;
                this._updateFontSizeUI();
                this._applyFontSize();
                this._saveFontSize();
            }
        }, { passive: false });
    }

    /**
     * 初始化外部文件变更自动热刷新 (Live Reload)
     */
    _initLiveReload() {
        if (!window.electronAPI?.onFileExternallyChanged) return;

        window.electronAPI.onFileExternallyChanged(({ filePath, fileName, content }) => {
            if (!this.currentFilePath) return;
            const currentNorm = this.currentFilePath.replace(/\\/g, '/').toLowerCase();
            const incomingNorm = String(filePath || '').replace(/\\/g, '/').toLowerCase();
            if (currentNorm !== incomingNorm) return;

            const localContent = this.editor ? this.editor.getValue() : this.currentContent;
            if (content === localContent) return;

            // 若当前有尚未保存的本地修改，不强行覆盖，仅做轻提示
            if (this.hasUnsavedChanges) {
                this._showToast(`${fileName} 已在外部更新（当前有未保存修改，未自动覆盖）`, 'info');
                return;
            }

            const readRatio = this.renderer.getScrollPercentage();
            const editRatio = this.editor ? this.editor.getScrollPercentage() : 0;

            this.currentContent = content;
            this._updateWordCount(content);
            this.parser.setBasePath(this.currentFilePath);

            const outline = this.parser.extractOutline(content);
            this.eventBus.emit(Events.OUTLINE_UPDATED, outline);

            if (this.isEditMode && this.editor) {
                this.editor.setValue(content);
                // setValue 会触发 onChange 标脏，立即还原未修改状态并取消自动保存
                if (this.autoSaveTimer) {
                    clearTimeout(this.autoSaveTimer);
                    this.autoSaveTimer = null;
                }
                this.hasUnsavedChanges = false;
                this.elements.saveIndicator?.classList.remove('saving');
                this._updateSaveIndicator();
                requestAnimationFrame(() => this.editor?.setScrollPercentage(editRatio));
            } else {
                const html = content.trim() ? this.parser.parse(content) : ' ';
                this.eventBus.emit(Events.CONTENT_PARSED, { html, outline });
                requestAnimationFrame(() => {
                    this.renderer.setScrollPercentage(readRatio);
                    this._updateReadingProgress();
                });
            }

            this._showToast('检测到外部更新，已自动刷新', 'info');
        });
    }

    /**
     * 初始化页内查找 (Ctrl+F)
     */
    _initSearch() {
        const { searchInput, searchPrev, searchNext, searchClose } = this.elements;
        if (!searchInput) return;

        searchInput.addEventListener('input', () => {
            this._performSearch();
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this._navigateSearch(e.shiftKey ? -1 : 1);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this._closeSearch();
            }
        });

        searchPrev?.addEventListener('click', () => this._navigateSearch(-1));
        searchNext?.addEventListener('click', () => this._navigateSearch(1));
        searchClose?.addEventListener('click', () => this._closeSearch());
    }

    _openSearch() {
        const { searchBar, searchInput } = this.elements;
        if (!searchBar || !searchInput) return;

        this.searchVisible = true;
        searchBar.style.display = 'flex';

        // 若有选中文本则自动填入搜索框
        const selected = window.getSelection()?.toString()?.trim();
        if (selected && selected.length <= 80 && !selected.includes('\n')) {
            searchInput.value = selected;
        }

        searchInput.focus();
        searchInput.select();
        this._performSearch();
    }

    _closeSearch() {
        this.searchVisible = false;
        if (this.elements.searchBar) {
            this.elements.searchBar.style.display = 'none';
        }
        this._clearSearchHighlights();
        this.searchMatches = [];
        this.searchIndex = -1;
        if (this.elements.searchCount) {
            this.elements.searchCount.textContent = '';
        }
    }

    _clearSearchHighlights() {
        if (!this.elements.content) return;
        const marks = this.elements.content.querySelectorAll('mark.search-match');
        marks.forEach(mark => {
            const parent = mark.parentNode;
            if (!parent) return;
            parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
            parent.normalize();
        });
    }

    _performSearch() {
        const query = this.elements.searchInput?.value || '';
        this._clearSearchHighlights();
        this.searchMatches = [];
        this.searchIndex = -1;

        if (!query) {
            if (this.elements.searchCount) this.elements.searchCount.textContent = '';
            return;
        }

        const lowerQuery = query.toLowerCase();

        if (this.isEditMode && this.editor?.view) {
            // 编辑模式：在 CodeMirror 文档中定位所有匹配位置
            const text = this.editor.getValue();
            const lowerText = text.toLowerCase();
            let pos = 0;
            while (pos < lowerText.length) {
                const idx = lowerText.indexOf(lowerQuery, pos);
                if (idx === -1) break;
                this.searchMatches.push({ from: idx, to: idx + query.length });
                pos = idx + Math.max(1, query.length);
            }
        } else if (this.elements.content) {
            // 阅读模式：遍历文本节点包裹 <mark class="search-match">
            const walker = document.createTreeWalker(
                this.elements.content,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: (node) => {
                        const parent = node.parentElement;
                        if (!parent) return NodeFilter.FILTER_REJECT;
                        if (parent.closest('.code-copy-btn, script, style')) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        return node.nodeValue && node.nodeValue.toLowerCase().includes(lowerQuery)
                            ? NodeFilter.FILTER_ACCEPT
                            : NodeFilter.FILTER_SKIP;
                    }
                }
            );

            const textNodes = [];
            let currentNode;
            while ((currentNode = walker.nextNode())) {
                textNodes.push(currentNode);
            }

            textNodes.forEach(node => {
                const value = node.nodeValue;
                const lowerVal = value.toLowerCase();
                let lastIdx = 0;
                const frag = document.createDocumentFragment();
                let matchIdx;

                while ((matchIdx = lowerVal.indexOf(lowerQuery, lastIdx)) !== -1) {
                    if (matchIdx > lastIdx) {
                        frag.appendChild(document.createTextNode(value.slice(lastIdx, matchIdx)));
                    }
                    const mark = document.createElement('mark');
                    mark.className = 'search-match';
                    mark.textContent = value.slice(matchIdx, matchIdx + query.length);
                    frag.appendChild(mark);
                    this.searchMatches.push(mark);
                    lastIdx = matchIdx + query.length;
                }

                if (lastIdx < value.length) {
                    frag.appendChild(document.createTextNode(value.slice(lastIdx)));
                }
                node.parentNode?.replaceChild(frag, node);
            });
        }

        if (this.searchMatches.length > 0) {
            this.searchIndex = 0;
            this._activateSearchMatch();
        } else if (this.elements.searchCount) {
            this.elements.searchCount.textContent = '0 / 0';
        }
    }

    _navigateSearch(delta) {
        if (this.searchMatches.length === 0) return;
        this.searchIndex = (this.searchIndex + delta + this.searchMatches.length) % this.searchMatches.length;
        this._activateSearchMatch();
    }

    _activateSearchMatch() {
        const total = this.searchMatches.length;
        if (total === 0 || this.searchIndex < 0) return;

        if (this.elements.searchCount) {
            this.elements.searchCount.textContent = `${this.searchIndex + 1} / ${total}`;
        }

        if (this.isEditMode && this.editor?.view) {
            const match = this.searchMatches[this.searchIndex];
            this.editor.view.dispatch({
                selection: { anchor: match.from, head: match.to },
                scrollIntoView: true
            });
        } else {
            this.searchMatches.forEach(el => el.classList.remove('search-match-current'));
            const current = this.searchMatches[this.searchIndex];
            if (current && current.scrollIntoView) {
                current.classList.add('search-match-current');
                current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }

    /**
     * 显示未保存正文确认对话框
     */
    _showUnsavedContentDialog() {
        return new Promise((resolve) => {
            const dialog = document.getElementById('unsaved-content-dialog');
            if (!dialog) {
                resolve('discard');
                return;
            }

            dialog.style.display = 'flex';
            const clickHandler = (e) => {
                const btn = e.target.closest('[data-action]');
                if (btn) {
                    dialog.style.display = 'none';
                    dialog.removeEventListener('click', clickHandler);
                    resolve(btn.dataset.action);
                }
            };
            dialog.addEventListener('click', clickHandler);
        });
    }

    /**
     * 处理窗口关闭事件（由 main.js 调用）
     * 返回 true 表示可以关闭，false 表示取消关闭
     */
    async _handleWindowClose() {
        // 1. 检查未保存的正文内容
        const currentText = this.editor ? this.editor.getValue() : this.currentContent;
        const hasPendingTextChanges = this.hasUnsavedChanges && (this.currentFilePath || (currentText && currentText.trim().length > 0));
        if (hasPendingTextChanges) {
            const action = await this._showUnsavedContentDialog();
            if (action === 'cancel') {
                return false;
            }
            if (action === 'save') {
                await this._saveFile(false);
                if (this.hasUnsavedChanges) {
                    // 用户在保存对话框点击了取消或保存失败，不关闭窗口
                    return false;
                }
            }
        }

        // 2. 检查是否有未保存的高亮
        if (!this._hasUnsavedHighlights()) {
            return true;  // 没有未保存的高亮，允许关闭
        }

        // 显示保存确认对话框
        const action = await this._showSaveHighlightsDialog();

        if (action === 'save') {
            // 保存高亮
            this._saveHighlightsToPersistence();
            return true;  // 保存后关闭
        } else if (action === 'discard') {
            // 不保存，直接关闭
            return true;
        } else {
            // 取消关闭
            return false;
        }
    }
}

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
    window.app.init();
});
