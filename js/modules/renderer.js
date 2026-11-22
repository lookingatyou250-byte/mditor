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
        this._mermaidLoadPromise = null;
        this._mermaidRenderSeq = 0;

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
            // 0. 任务列表复选框交互切换
            const taskCheckbox = e.target.closest('input.task-checkbox[data-task-index]');
            if (taskCheckbox) {
                e.stopPropagation();
                const taskIndex = parseInt(taskCheckbox.dataset.taskIndex, 10);
                if (!Number.isNaN(taskIndex)) {
                    this.eventBus.emit('task:toggled', {
                        index: taskIndex,
                        checked: Boolean(taskCheckbox.checked)
                    });
                }
                return;
            }

            // 1. 代码块 / 代码全文 / 纯文本 / Mermaid 源码一键复制
            const copyBtn = e.target.closest('.code-copy-btn');
            if (copyBtn) {
                e.preventDefault();
                e.stopPropagation();
                const container = copyBtn.closest('pre, .mermaid-block, .doc-code-view, .doc-plain-view');
                const codeEl = container?.querySelector('code');
                const defaultLabel = copyBtn.classList.contains('doc-copy-btn')
                    ? '复制全部'
                    : (copyBtn.closest('.mermaid-block') ? '复制源码' : '复制');
                if (codeEl) {
                    try {
                        await navigator.clipboard.writeText(codeEl.textContent || '');
                        copyBtn.textContent = '已复制';
                        copyBtn.classList.add('copied');
                        setTimeout(() => {
                            copyBtn.textContent = defaultLabel;
                            copyBtn.classList.remove('copied');
                        }, 1800);
                    } catch {
                        copyBtn.textContent = '复制失败';
                        setTimeout(() => { copyBtn.textContent = defaultLabel; }, 1500);
                    }
                }
                return;
            }

            // 2. 链接点击：始终阻止默认导航（杜绝 Electron 跳转卡死或误开记事本）
            const link = e.target.closest('a[href]');
            if (link) {
                e.preventDefault();
                e.stopPropagation();
                const href = (link.getAttribute('href') || '').trim();
                if (!href) return;

                if (/^(https?:|mailto:)/i.test(href)) {
                    if (window.electronAPI?.openExternal) {
                        window.electronAPI.openExternal(href);
                    } else {
                        window.open(href, '_blank', 'noopener,noreferrer');
                    }
                    return;
                }

                if (href.startsWith('#')) {
                    const targetId = decodeURIComponent(href.slice(1));
                    const targetEl = document.getElementById(targetId) || document.getElementById(`heading-${targetId}`);
                    if (targetEl) {
                        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                    return;
                }

                // 本地相对/绝对路径链接（如 ./other.md、../doc.md#section、file:///...）交由 mditor 内部打开
                this.eventBus.emit('link:open-local', {
                    href,
                    openInNewWindow: Boolean(e.metaKey || e.ctrlKey)
                });
                return;
            }

            // 3. 图片点击：打开灯箱放大预览
            const img = e.target.closest('img');
            if (img && img.src) {
                this._openImageLightbox(img.src, img.alt || '');
                return;
            }

            // 4. Mermaid 图表点击：在灯箱中放大查看矢量图
            const mermaidDiagram = e.target.closest('.mermaid-diagram.rendered');
            if (mermaidDiagram) {
                const svgEl = mermaidDiagram.querySelector('svg');
                if (svgEl) {
                    const cloned = svgEl.cloneNode(true);
                    if (!cloned.getAttribute('xmlns')) {
                        cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                    }
                    const svgData = new XMLSerializer().serializeToString(cloned);
                    const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
                    this._openImageLightbox(dataUrl, 'Mermaid 图表预览（按 Esc 或点击空白处关闭）');
                }
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
        lightboxImg.classList.toggle('is-svg-preview', String(src || '').startsWith('data:image/svg+xml'));
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

        this.eventBus.on(Events.THEME_CHANGED, () => {
            this._renderMermaid();
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

        // 渲染数学公式 (KaTeX)
        this._renderMath();

        // 按需渲染 Mermaid 图表
        this._renderMermaid();

        // 添加段落交互
        this._setupParagraphInteraction();

        // 发布完成事件
        this.eventBus.emit(Events.RENDER_COMPLETE);
    }

    /**
     * 空状态提示
     */
    _getEmptyState() {
        const isMac = window.electronAPI?.platform === 'darwin';
        const mod = isMac ? '⌘' : 'Ctrl';
        return `
      <div class="empty-state">
        <div class="empty-icon">📄</div>
        <h2>欢迎使用 mditor</h2>
        <p>拖拽 .md 文件或文件夹到此处，或使用快捷键打开</p>
        <div class="shortcuts-hint">
          <span><kbd>${mod}</kbd>+<kbd>O</kbd> 打开文件</span>
          <span><kbd>${mod}</kbd>+<kbd>\\</kbd> 切换侧边栏</span>
          <span><kbd>${mod}</kbd>+<kbd>P</kbd> 快速跳转</span>
        </div>
      </div>
    `;
    }

    /**
     * 代码高亮（同时作用于 Markdown 内嵌代码块与独立代码文件阅读视图）
     */
    _highlightCode() {
        if (typeof hljs === 'undefined') return;

        this.contentEl.querySelectorAll('pre.code-block code, pre.code-view-pre:not(.no-highlight) code').forEach(block => {
            hljs.highlightElement(block);
        });
    }

    /**
     * 离线渲染 LaTeX 数学公式 (KaTeX)
     */
    _renderMath() {
        if (!this.contentEl || typeof window.katex === 'undefined') return;

        const mathEls = this.contentEl.querySelectorAll('.math-block, .math-inline');
        if (mathEls.length === 0) return;

        mathEls.forEach(el => {
            let tex = '';
            const encoded = el.getAttribute('data-math-uri');
            if (encoded) {
                try {
                    tex = decodeURIComponent(encoded);
                } catch {
                    tex = '';
                }
            }
            if (!tex) {
                tex = el.getAttribute('data-math') || '';
            }
            if (!tex) {
                const raw = (el.textContent || '').trim();
                tex = raw.replace(/^\$\$|\$\$$/g, '').replace(/^\$|\$$/g, '').trim();
            }
            if (!tex) return;
            const displayMode = el.classList.contains('math-block');
            try {
                window.katex.render(tex, el, {
                    displayMode,
                    throwOnError: false,
                    strict: false,
                    trust: false
                });
            } catch (err) {
                console.warn('KaTeX render failed:', err);
            }
        });
    }

    /**
     * 按需懒加载离线 Mermaid 引擎
     */
    _ensureMermaidLoaded() {
        if (typeof window.mermaid !== 'undefined') {
            return Promise.resolve(window.mermaid);
        }
        if (this._mermaidLoadPromise) {
            return this._mermaidLoadPromise;
        }
        this._mermaidLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'lib/mermaid.min.js';
            script.onload = () => resolve(window.mermaid);
            script.onerror = (err) => {
                this._mermaidLoadPromise = null;
                reject(err);
            };
            document.head.appendChild(script);
        });
        return this._mermaidLoadPromise;
    }

    /**
     * 按需渲染 Mermaid 流程图 / 时序图 / 架构图（随亮/暗色主题自适应）
     */
    async _renderMermaid() {
        if (!this.contentEl) return;
        const blocks = Array.from(this.contentEl.querySelectorAll('.mermaid-block'));
        if (blocks.length === 0) return;

        try {
            const mermaid = await this._ensureMermaidLoaded();
            if (!mermaid) return;

            const isDark = this.state.get('ui.theme') === 'dark';
            mermaid.initialize({
                startOnLoad: false,
                securityLevel: 'strict',
                theme: 'base',
                themeVariables: isDark ? {
                    darkMode: true,
                    background: '#181714',
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
                    primaryColor: '#2A2824',
                    primaryTextColor: '#ECE8DF',
                    primaryBorderColor: '#D97757',
                    lineColor: '#A8A296',
                    secondaryColor: '#21201C',
                    tertiaryColor: '#1A1916',
                    noteBkgColor: '#2A2824',
                    noteTextColor: '#ECE8DF',
                    noteBorderColor: '#D97757'
                } : {
                    darkMode: false,
                    background: '#FAF8F3',
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
                    primaryColor: '#EBE6DC',
                    primaryTextColor: '#26231E',
                    primaryBorderColor: '#C96442',
                    lineColor: '#635D53',
                    secondaryColor: '#E4DFD3',
                    tertiaryColor: '#F4F1EA',
                    noteBkgColor: '#EBE6DC',
                    noteTextColor: '#26231E',
                    noteBorderColor: '#C96442'
                }
            });

            for (const block of blocks) {
                const el = block.querySelector('.mermaid-diagram');
                if (!el) continue;
                const code = (
                    block.querySelector('.mermaid-source code')?.textContent ||
                    el.getAttribute('data-mermaid') ||
                    ''
                ).trim();
                if (!code) continue;

                const renderId = `mditor-mermaid-${++this._mermaidRenderSeq}`;
                try {
                    const { svg } = await mermaid.render(renderId, code);
                    el.innerHTML = svg;
                    el.classList.add('rendered');
                    el.classList.remove('render-error');
                    el.title = '点击放大查看图表';
                } catch (diagramErr) {
                    el.textContent = `Mermaid 语法错误: ${diagramErr.message || diagramErr}`;
                    el.classList.add('render-error');
                    el.classList.remove('rendered');
                }
            }
        } catch (err) {
            console.error('Mermaid load/render failed:', err);
            blocks.forEach(block => {
                const el = block.querySelector('.mermaid-diagram');
                if (el && !el.classList.contains('rendered')) {
                    el.textContent = `Mermaid 图表加载失败: ${err.message || err}`;
                    el.classList.add('render-error');
                }
            });
        }
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
