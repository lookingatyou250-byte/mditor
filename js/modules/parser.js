/**
 * Markdown Parser - Markdown 解析模块
 * 封装 marked.js，提供安全的解析功能
 */
class MarkdownParser {
    constructor(eventBus, state) {
        this.eventBus = eventBus;
        this.state = state;
        this._configureMarked();
    }

    /**
     * 配置 marked.js
     */
    _configureMarked() {
        // 确保 marked 已加载
        if (typeof marked === 'undefined') {
            console.error('marked.js not loaded');
            return;
        }

        // 配置选项
        marked.setOptions({
            gfm: true,           // GitHub Flavored Markdown
            breaks: true,        // 换行转 <br>
            headerIds: true,     // 标题添加 id
            mangle: false,       // 不混淆邮箱
            headerPrefix: 'heading-'
        });

        // 自定义渲染器
        const renderer = new marked.Renderer();

        // 代码块：添加语言类名和复制按钮占位
        renderer.code = (code, language) => {
            const lang = language || 'plaintext';
            const escapedCode = this._escapeHtml(code);
            return `<pre class="code-block" data-lang="${lang}"><code class="language-${lang}">${escapedCode}</code></pre>`;
        };

        // 链接：外部链接新标签打开
        renderer.link = (href, title, text) => {
            const isExternal = href && (href.startsWith('http://') || href.startsWith('https://'));
            const target = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
            const titleAttr = title ? ` title="${this._escapeHtml(title)}"` : '';
            return `<a href="${this._escapeHtml(href)}"${titleAttr}${target}>${text}</a>`;
        };

        // 图片：添加懒加载和容器
        renderer.image = (href, title, text) => {
            const titleAttr = title ? ` title="${this._escapeHtml(title)}"` : '';
            const altText = this._escapeHtml(text);
            return `<figure class="image-container">
        <img src="${this._escapeHtml(href)}" alt="${altText}"${titleAttr} loading="lazy">
        ${text ? `<figcaption>${altText}</figcaption>` : ''}
      </figure>`;
        };

        // 任务列表
        renderer.listitem = (text, task, checked) => {
            if (task) {
                const checkedAttr = checked ? ' checked disabled' : ' disabled';
                return `<li class="task-list-item"><input type="checkbox"${checkedAttr}>${text}</li>`;
            }
            return `<li>${text}</li>`;
        };

        // 标题：使用与 extractOutline 一致的 ID 生成算法
        renderer.heading = (text, level) => {
            const id = 'heading-' + text.toLowerCase()
                .replace(/<[^>]*>/g, '')  // 移除 HTML 标签
                .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
                .replace(/^-|-$/g, '');
            return `<h${level} id="${id}">${text}</h${level}>`;
        };

        marked.use({ renderer });
    }

    /**
     * HTML 转义
     */
    _escapeHtml(str) {
        if (!str) return '';
        const escapeMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return str.replace(/[&<>"']/g, char => escapeMap[char]);
    }

    /**
     * 解析 Markdown
     * @param {string} markdown - Markdown 文本
     * @returns {string} HTML 字符串
     */
    parse(markdown) {
        if (!markdown) return '';

        try {
            const html = marked.parse(markdown);
            return this._sanitize(html);
        } catch (error) {
            console.error('Parse error:', error);
            return `<p class="parse-error">解析错误: ${error.message}</p>`;
        }
    }

    /**
     * 安全过滤 HTML
     * 移除危险标签和属性
     */
    _sanitize(html) {
        // 危险标签
        const dangerousTags = ['script', 'style', 'iframe', 'object', 'embed', 'form'];
        dangerousTags.forEach(tag => {
            const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
            html = html.replace(regex, '');
            html = html.replace(new RegExp(`<${tag}[^>]*\\/?>`, 'gi'), '');
        });

        // 危险属性
        const dangerousAttrs = ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus', 'onblur'];
        dangerousAttrs.forEach(attr => {
            const regex = new RegExp(`\\s${attr}\\s*=\\s*["'][^"']*["']`, 'gi');
            html = html.replace(regex, '');
        });

        // javascript: 协议
        html = html.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');

        return html;
    }

    /**
     * 提取大纲
     * @param {string} markdown - Markdown 文本
     * @returns {Array} 标题数组
     */
    extractOutline(markdown) {
        if (!markdown) return [];

        const outline = [];
        const lines = markdown.split('\n');
        let inCodeBlock = false;

        lines.forEach((line, index) => {
            // 检测代码块
            if (line.trim().startsWith('```')) {
                inCodeBlock = !inCodeBlock;
                return;
            }

            if (inCodeBlock) return;

            // 匹配标题
            const match = line.match(/^(#{1,6})\s+(.+)$/);
            if (match) {
                const level = match[1].length;
                const text = match[2].trim();
                const id = 'heading-' + text.toLowerCase()
                    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
                    .replace(/^-|-$/g, '');

                outline.push({
                    level,
                    text,
                    id,
                    line: index + 1
                });
            }
        });

        return outline;
    }
}
