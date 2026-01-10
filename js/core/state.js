/**
 * State Manager - 响应式状态管理
 * 单一状态树，支持订阅变化通知
 */
class StateManager {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.state = this._createInitialState();
        this.subscribers = new Map();
    }

    /**
     * 创建初始状态
     */
    _createInitialState() {
        return {
            // 文档状态
            document: {
                raw: '',           // 原始 Markdown
                html: '',          // 渲染后的 HTML
                outline: [],       // 目录结构
                fileName: null,    // 文件名
                filePath: null     // 文件路径
            },

            // UI 状态
            ui: {
                theme: this._loadTheme(),
                focusMode: false,
                typewriterMode: false,
                sidebarVisible: true,
                currentHeading: null,
                isLoading: false
            },

            // 编辑状态 (P1 预留)
            editor: {
                isEditing: false,
                cursorPosition: null,
                selection: null,
                isDirty: false,
                history: {
                    past: [],
                    future: []
                }
            }
        };
    }

    /**
     * 从 localStorage 加载主题
     */
    _loadTheme() {
        const saved = localStorage.getItem('md-reader-theme');
        if (saved) return saved;

        // 检测系统偏好
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }

    /**
     * 获取状态
     * @param {string} path - 点分隔的路径，如 'ui.theme'
     * @returns {any}
     */
    get(path) {
        if (!path) return this.state;

        return path.split('.').reduce((obj, key) => {
            return obj && obj[key] !== undefined ? obj[key] : undefined;
        }, this.state);
    }

    /**
     * 设置状态
     * @param {string} path - 点分隔的路径
     * @param {any} value - 新值
     */
    set(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();

        let current = this.state;
        for (const key of keys) {
            if (!current[key]) {
                current[key] = {};
            }
            current = current[key];
        }

        const oldValue = current[lastKey];
        current[lastKey] = value;

        // 通知订阅者
        this._notifySubscribers(path, value, oldValue);
    }

    /**
     * 批量更新状态
     * @param {Object} updates - { path: value } 对象
     */
    batch(updates) {
        Object.entries(updates).forEach(([path, value]) => {
            this.set(path, value);
        });
    }

    /**
     * 订阅状态变化
     * @param {string} path - 监听的路径
     * @param {Function} callback - 回调函数 (newValue, oldValue)
     * @returns {Function} 取消订阅函数
     */
    subscribe(path, callback) {
        if (!this.subscribers.has(path)) {
            this.subscribers.set(path, new Set());
        }
        this.subscribers.get(path).add(callback);

        return () => {
            this.subscribers.get(path).delete(callback);
        };
    }

    /**
     * 通知订阅者
     */
    _notifySubscribers(path, newValue, oldValue) {
        // 精确匹配
        if (this.subscribers.has(path)) {
            this.subscribers.get(path).forEach(cb => cb(newValue, oldValue));
        }

        // 父路径通知（如 'ui' 监听 'ui.theme' 变化）
        const parts = path.split('.');
        for (let i = parts.length - 1; i > 0; i--) {
            const parentPath = parts.slice(0, i).join('.');
            if (this.subscribers.has(parentPath)) {
                this.subscribers.get(parentPath).forEach(cb => cb(this.get(parentPath)));
            }
        }
    }

    /**
     * 持久化主题设置
     */
    persistTheme() {
        localStorage.setItem('md-reader-theme', this.state.ui.theme);
    }

    /**
     * 重置状态
     */
    reset() {
        this.state = this._createInitialState();
        this.subscribers.forEach((callbacks, path) => {
            callbacks.forEach(cb => cb(this.get(path)));
        });
    }

    /**
     * 获取调试信息
     */
    debug() {
        console.group('State Debug');
        console.log('Current State:', JSON.parse(JSON.stringify(this.state)));
        console.log('Subscribers:', Array.from(this.subscribers.keys()));
        console.groupEnd();
    }
}
