/**
 * File Handler - 文件处理模块
 * 支持拖拽和选择文件
 */
class FileHandler {
    constructor(eventBus, state) {
        this.eventBus = eventBus;
        this.state = state;
        this.dropZone = null;
        this.fileInput = null;
    }

    /**
     * 初始化
     */
    init(dropZone, fileInput) {
        this.dropZone = dropZone;
        this.fileInput = fileInput;

        this._setupDragAndDrop();
        this._setupFileInput();
        this._setupKeyboard();
    }

    /**
     * 设置拖拽
     */
    _setupDragAndDrop() {
        if (!this.dropZone) return;

        // 防止默认行为
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        // 拖拽进入
        ['dragenter', 'dragover'].forEach(eventName => {
            this.dropZone.addEventListener(eventName, () => {
                this.dropZone.classList.add('drag-over');
            });
        });

        // 拖拽离开
        ['dragleave', 'drop'].forEach(eventName => {
            this.dropZone.addEventListener(eventName, () => {
                this.dropZone.classList.remove('drag-over');
            });
        });

        // 放置
        this.dropZone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this._handleFile(files[0]);
            }
        });
    }

    /**
     * 设置文件选择
     */
    _setupFileInput() {
        if (!this.fileInput) return;

        this.fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this._handleFile(file);
            }
        });
    }

    /**
     * 设置键盘快捷键
     */
    _setupKeyboard() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+O 打开文件
            if (e.ctrlKey && e.key === 'o') {
                e.preventDefault();
                this.openFilePicker();
            }
        });
    }

    /**
     * 打开文件选择器
     */
    openFilePicker() {
        if (this.fileInput) {
            this.fileInput.click();
        }
    }

    /**
     * 处理文件
     */
    _handleFile(file) {
        // 验证文件类型
        if (!this._isMarkdownFile(file)) {
            this.eventBus.emit(Events.FILE_ERROR, {
                message: '请选择 Markdown 文件 (.md, .markdown, .txt)'
            });
            return;
        }

        // 设置加载状态
        this.state.set('ui.isLoading', true);

        // 读取文件
        const reader = new FileReader();

        reader.onload = (e) => {
            const content = e.target.result;

            this.state.batch({
                'document.raw': content,
                'document.fileName': file.name,
                'ui.isLoading': false
            });

            this.eventBus.emit(Events.FILE_LOADED, {
                content,
                fileName: file.name
            });
        };

        reader.onerror = () => {
            this.state.set('ui.isLoading', false);
            this.eventBus.emit(Events.FILE_ERROR, {
                message: '文件读取失败'
            });
        };

        reader.readAsText(file);
    }

    /**
     * 检查是否为 Markdown 文件
     */
    _isMarkdownFile(file) {
        const validExtensions = ['.md', '.markdown', '.txt', '.mkd', '.mdx'];
        const fileName = file.name.toLowerCase();
        return validExtensions.some(ext => fileName.endsWith(ext));
    }
}
