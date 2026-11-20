/**
 * Renderer - DOM 渲染模块
 * 负责将解析后的 HTML 渲染到页面
 */
class Renderer {
    constructor(eventBus, state) {
        this.eventBus = eventBus;
        this.state = state;
        this.contentEl = null;
        this.highlightLoaded = false;

        this._bindEvents();
    }

    /**
     * 初始化
     */
    init(contentElement) {
        this.contentEl = contentElement;
    }

    /**
     * 绑定事件
     */
    _bindEvents() {
        this.eventBus.on(Events.CONTENT_PARSED, ({ html }) => {
            this.render(html);
        });

        this.eventBus.on(Events.FOCUS_MODE_TOGGLE, (enabled) => {
            this._toggleFocusMode(enabled);
        });
    }

    /**
     * 渲染 HTML 到容器
     */
    render(html) {
        if (!this.contentEl) {
            console.error('Content element not initialized');
            return;
        }

        // 滚动位置记忆
        const scrollTop = this.contentEl.scrollTop;

        // 渲染内容
        this.contentEl.innerHTML = html || this._getEmptyState();

        // 恢复滚动
        this.contentEl.scrollTop = scrollTop;

        // 代码高亮
        this._highlightCode();

        // 添加段落交互
        this._setupParagraphInteraction();

        // 发布完成事件
        this.eventBus.emit(Events.RENDER_COMPLETE);
    }

    /**
     * 空状态提示
     */
    _getEmptyState() {
        return `
      <div class="empty-state">
        <div class="empty-icon">📄</div>
        <h2>欢迎使用 Markdown 阅读器</h2>
        <p>拖拽 .md 文件到此处，或点击上方按钮选择文件</p>
        <div class="shortcuts-hint">
          <span><kbd>Ctrl</kbd>+<kbd>O</kbd> 打开文件</span>
          <span><kbd>Ctrl</kbd>+<kbd>\\</kbd> 切换侧边栏</span>
        </div>
      </div>
    `;
    }

    /**
     * 代码高亮
     */
    _highlightCode() {
        if (typeof hljs === 'undefined') return;

        this.contentEl.querySelectorAll('pre code').forEach(block => {
            hljs.highlightElement(block);
        });
    }

    /**
     * 设置段落交互（Focus Mode 用）
     */
    _setupParagraphInteraction() {
        const blocks = this.contentEl.querySelectorAll('p, h1, h2, h3, h4, h5, h6, pre, ul, ol, blockquote, table');

        blocks.forEach(block => {
            block.addEventListener('mouseenter', () => {
                if (this.state.get('ui.focusMode')) {
                    this._focusBlock(block);
                }
            });
        });
    }

    /**
     * 聚焦区块
     */
    _focusBlock(block) {
        // 移除之前的聚焦
        this.contentEl.querySelectorAll('.focused').forEach(el => {
            el.classList.remove('focused');
        });

        // 添加聚焦
        block.classList.add('focused');
    }

    /**
     * 切换 Focus Mode
     */
    _toggleFocusMode(enabled) {
        this.contentEl.classList.toggle('focus-mode', enabled);

        if (!enabled) {
            // 移除所有聚焦状态
            this.contentEl.querySelectorAll('.focused').forEach(el => {
                el.classList.remove('focused');
            });
        }
    }

    /**
     * 滚动到指定标题
     */
    scrollToHeading(headingId) {
        const heading = document.getElementById(headingId);
        if (heading) {
            heading.scrollIntoView({ behavior: 'smooth', block: 'start' });

            // 高亮动画
            heading.classList.add('highlight-flash');
            setTimeout(() => heading.classList.remove('highlight-flash'), 1500);
        }
    }

    /**
     * 打字机模式滚动
     */
    typewriterScroll() {
        if (!this.state.get('ui.typewriterMode')) return;

        const focused = this.contentEl.querySelector('.focused');
        if (focused) {
            const containerRect = this.contentEl.getBoundingClientRect();
            const focusedRect = focused.getBoundingClientRect();
            const centerY = containerRect.height / 2;
            const focusedCenterY = focusedRect.top - containerRect.top + focusedRect.height / 2;

            this.contentEl.scrollBy({
                top: focusedCenterY - centerY,
                behavior: 'smooth'
            });
        }
    }
}
