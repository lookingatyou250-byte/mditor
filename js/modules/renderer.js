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
        this._bindContentDelegation();
    }

    /**
     * 绑定内容区事件委托（代码块复制 / 外链打开 / 锚点跳转 / 图片灯箱）
     */
    _bindContentDelegation() {
        if (!this.contentEl || this._delegated) return;
        this._delegated = true;

        this.contentEl.addEventListener('click', async (e) => {
            // 1. 代码块一键复制
            const copyBtn = e.target.closest('.code-copy-btn');
            if (copyBtn) {
                e.preventDefault();
                e.stopPropagation();
                const pre = copyBtn.closest('pre');
                const codeEl = pre?.querySelector('code');
                if (codeEl) {
                    try {
                        await navigator.clipboard.writeText(codeEl.textContent || '');
                        copyBtn.textContent = '已复制';
                        copyBtn.classList.add('copied');
                        setTimeout(() => {
                            copyBtn.textContent = '复制';
                            copyBtn.classList.remove('copied');
                        }, 1800);
                    } catch {
                        copyBtn.textContent = '复制失败';
                        setTimeout(() => { copyBtn.textContent = '复制'; }, 1500);
                    }
                }
                return;
            }

            // 2. 链接点击：外链走系统浏览器，页内锚点平滑滚动
            const link = e.target.closest('a[href]');
            if (link) {
                const href = link.getAttribute('href') || '';
                if (href.startsWith('http://') || href.startsWith('https://')) {
                    e.preventDefault();
                    if (window.electronAPI?.openExternal) {
                        window.electronAPI.openExternal(href);
                    } else {
                        window.open(href, '_blank', 'noopener,noreferrer');
                    }
                    return;
                }
                if (href.startsWith('#')) {
                    e.preventDefault();
                    const targetId = decodeURIComponent(href.slice(1));
                    const targetEl = document.getElementById(targetId) || document.getElementById(`heading-${targetId}`);
                    if (targetEl) {
                        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                    return;
                }
            }

            // 3. 图片点击：打开灯箱放大预览
            const img = e.target.closest('img');
            if (img && img.src) {
                this._openImageLightbox(img.src, img.alt || '');
            }
        });
    }

    /**
     * 打开图片灯箱
     */
    _openImageLightbox(src, alt) {
        const lightbox = document.getElementById('image-lightbox');
        const lightboxImg = document.getElementById('image-lightbox-img');
        const lightboxCaption = document.getElementById('image-lightbox-caption');
        if (!lightbox || !lightboxImg) return;

        lightboxImg.src = src;
        lightboxImg.alt = alt;
        if (lightboxCaption) {
            lightboxCaption.textContent = alt;
            lightboxCaption.style.display = alt ? 'block' : 'none';
        }
        lightbox.style.display = 'flex';
    }

    /**
     * 清空内容区
     */
    clear() {
        if (this.contentEl) {
            this.contentEl.innerHTML = '';
            this.contentEl.scrollTop = 0;
        }
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
     * 获取当前阅读视图滚动百分比 (0 ~ 1)
     */
    getScrollPercentage() {
        if (!this.contentEl) return 0;
        const maxScroll = this.contentEl.scrollHeight - this.contentEl.clientHeight;
        if (maxScroll <= 0) return 0;
        return Math.max(0, Math.min(1, this.contentEl.scrollTop / maxScroll));
    }

    /**
     * 按百分比设置阅读视图滚动位置 (0 ~ 1)
     */
    setScrollPercentage(percentage) {
        if (!this.contentEl) return;
        const clamped = Math.max(0, Math.min(1, Number(percentage) || 0));
        const maxScroll = this.contentEl.scrollHeight - this.contentEl.clientHeight;
        this.contentEl.scrollTop = maxScroll > 0 ? maxScroll * clamped : 0;
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
