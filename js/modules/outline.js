/**
 * Outline - 大纲导航模块
 * 生成并渲染文档目录
 */
class Outline {
    constructor(eventBus, state) {
        this.eventBus = eventBus;
        this.state = state;
        this.containerEl = null;
        this.currentActive = null;

        this._bindEvents();
    }

    /**
     * 初始化
     */
    init(containerElement) {
        this.containerEl = containerElement;
    }

    /**
     * 绑定事件
     */
    _bindEvents() {
        this.eventBus.on(Events.OUTLINE_UPDATED, (outline) => {
            this.render(outline);
        });

        this.eventBus.on(Events.RENDER_COMPLETE, () => {
            this._setupScrollSpy();
        });
    }

    /**
     * 渲染大纲
     */
    render(outline) {
        if (!this.containerEl) return;

        if (!outline || outline.length === 0) {
            this.containerEl.innerHTML = '<div class="outline-empty">暂无目录</div>';
            return;
        }

        const html = this._buildOutlineTree(outline);
        this.containerEl.innerHTML = html;

        // 绑定点击事件
        this.containerEl.querySelectorAll('.outline-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const headingId = item.dataset.heading;
                this.eventBus.emit(Events.OUTLINE_NAVIGATE, headingId);
            });
        });
    }

    /**
     * 构建大纲树
     */
    _buildOutlineTree(outline) {
        let html = '<ul class="outline-list">';

        outline.forEach(item => {
            const indent = (item.level - 1) * 16;
            html += `
        <li class="outline-item level-${item.level}" 
            data-heading="${item.id}" 
            style="padding-left: ${indent}px">
          <span class="outline-marker"></span>
          <span class="outline-text">${this._escapeHtml(item.text)}</span>
        </li>
      `;
        });

        html += '</ul>';
        return html;
    }

    /**
     * HTML 转义
     */
    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * 设置滚动监听
     */
    _setupScrollSpy() {
        const contentEl = document.querySelector('.content-area');
        if (!contentEl) return;

        const headings = contentEl.querySelectorAll('h1, h2, h3, h4, h5, h6');
        if (headings.length === 0) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this._setActive(entry.target.id);
                }
            });
        }, {
            root: contentEl,
            rootMargin: '-20% 0px -80% 0px',
            threshold: 0
        });

        headings.forEach(heading => {
            if (heading.id) {
                observer.observe(heading);
            }
        });
    }

    /**
     * 设置当前激活项
     */
    _setActive(headingId) {
        if (this.currentActive === headingId) return;

        // 移除之前的激活状态
        this.containerEl.querySelectorAll('.outline-item.active').forEach(item => {
            item.classList.remove('active');
        });

        // 添加新的激活状态
        const activeItem = this.containerEl.querySelector(`[data-heading="${headingId}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
            this.currentActive = headingId;

            // 确保在可视区域
            activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }
}
