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
            // Ctrl/Cmd+O 打开文件
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
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
     * 处理文件或拖拽的文件夹
     */
    async _handleFile(file) {
        // 如果在 Electron 环境且拖入的是文件夹，交由文件夹加载逻辑处理
        if (file.path && window.electronAPI?.statPath) {
            try {
                const stat = await window.electronAPI.statPath(file.path);
                if (stat && stat.isDirectory) {
                    this.eventBus.emit('folder:loaded', {
                        folderPath: stat.path,
                        folderName: stat.name
                    });
                    return;
                }
            } catch {
                // ignore and fallback to file handling
            }
        }

        // 拦截已知二进制 / 图片 / Office / 压缩包文件
        if (window.MditorFileTypes?.isKnownBinary?.(file.name)) {
            this.eventBus.emit(Events.FILE_ERROR, {
                message: '不支持打开图片、PDF、Office 或二进制文件'
            });
            return;
        }

        // 防卡死：限制单文件最大 20 MB
        if (file.size && file.size > 20 * 1024 * 1024) {
            this.eventBus.emit(Events.FILE_ERROR, {
                message: '文件超过 20 MB，为保持轻量流畅已跳过打开'
            });
            return;
        }

        // 设置加载状态
        this.state.set('ui.isLoading', true);

        // 读取文件
        const reader = new FileReader();

        reader.onload = (e) => {
            const content = e.target.result;

            // 二进制内容嗅探兜底（防止无后缀或未知后缀的二进制文件乱码）
            if (window.MditorFileTypes?.isBinaryString?.(content)) {
                this.state.set('ui.isLoading', false);
                this.eventBus.emit(Events.FILE_ERROR, {
                    message: '检测到二进制内容，不支持打开此类文件'
                });
                return;
            }

            this.state.batch({
                'document.raw': content,
                'document.fileName': file.name,
                'ui.isLoading': false
            });

            this.eventBus.emit(Events.FILE_LOADED, {
                content,
                fileName: file.name,
                filePath: file.path || null
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
     * 检查是否为可打开的纯文本/代码/Markdown 文件
     */
    _isMarkdownFile(file) {
        if (window.MditorFileTypes?.isKnownBinary) {
            return !window.MditorFileTypes.isKnownBinary(file.name);
        }
        const validExtensions = ['.md', '.markdown', '.txt', '.mkd', '.mdx'];
        const fileName = file.name.toLowerCase();
        return validExtensions.some(ext => fileName.endsWith(ext));
    }
}
