/**
 * Markdown Parser - Markdown 解析模块
 * 封装 marked.js，提供安全的解析功能
 */
class MarkdownParser {
    constructor(eventBus, state) {
        this.eventBus = eventBus;
        this.state = state;
        this.baseDir = null;
        this._configureMarked();
    }

    /**
     * 设置当前文档路径，用于解析相对路径图片
     */
    setBasePath(filePath) {
        if (!filePath) {
            this.baseDir = null;
            return;
        }
        const normalized = String(filePath).replace(/\\/g, '/');
        const lastSlash = normalized.lastIndexOf('/');
        this.baseDir = lastSlash >= 0 ? normalized.slice(0, lastSlash) : null;
    }

    /**
     * 解析相对路径图片为 file:// URL
     */
    _resolveImageUrl(href) {
        if (!href) return '';
        const trimmed = href.trim();
        // 已经是网络链接、data URI、blob 或 file://
        if (/^(https?:|data:|blob:|file:)/i.test(trimmed)) {
            return trimmed;
        }
        // Windows 绝对路径 (如 C:\foo\bar.png)
        if (/^[a-zA-Z]:[\\/]/.test(trimmed)) {
            return 'file:///' + encodeURI(trimmed.replace(/\\/g, '/'));
        }
        // 相对路径：基于当前打开的 Markdown 文件目录拼接并归一化
        if (this.baseDir) {
            const cleaned = trimmed.replace(/\\/g, '/');
            const baseParts = this.baseDir.split('/');
            const relParts = cleaned.split('/');
            for (const part of relParts) {
                if (!part || part === '.') continue;
                if (part === '..') {
                    if (baseParts.length > 1) baseParts.pop();
                } else {
                    baseParts.push(part);
                }
            }
            const joined = baseParts.join('/');
            const prefix = /^[a-zA-Z]:/.test(joined) ? 'file:///' : 'file://';
            return prefix + encodeURI(joined);
        }
        return trimmed;
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

        // 代码块：添加语言类名和一键复制按钮
        renderer.code = (code, language) => {
            const lang = this._escapeHtml(language || 'plaintext');
            const escapedCode = this._escapeHtml(code);
            return `<pre class="code-block" data-lang="${lang}"><button class="code-copy-btn" type="button" title="复制代码" aria-label="复制代码">复制</button><code class="language-${lang}">${escapedCode}</code></pre>`;
        };

        // 链接：外部链接新标签打开
        renderer.link = (href, title, text) => {
            const isExternal = href && (href.startsWith('http://') || href.startsWith('https://'));
            const target = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
            const titleAttr = title ? ` title="${this._escapeHtml(title)}"` : '';
            return `<a href="${this._escapeHtml(href)}"${titleAttr}${target}>${text}</a>`;
        };

        // 图片：解析本地相对路径并添加懒加载和容器
        renderer.image = (href, title, text) => {
            const resolvedHref = this._resolveImageUrl(href);
            const titleAttr = title ? ` title="${this._escapeHtml(title)}"` : '';
            const altText = this._escapeHtml(text);
            return `<figure class="image-container">
        <img src="${this._escapeHtml(resolvedHref)}" alt="${altText}"${titleAttr} loading="lazy">
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

        // 有序列表：保留 start 属性
        renderer.list = (body, ordered, start) => {
            const tag = ordered ? 'ol' : 'ul';
            const startAttr = (ordered && start !== 1) ? ` start="${start}"` : '';
            return `<${tag}${startAttr}>${body}</${tag}>`;
        };

        marked.use({ renderer });

        // 高亮扩展 (==text==)
        marked.use({
            extensions: [{
                name: 'highlight',
                level: 'inline',
                start(src) { return src.indexOf('=='); },
                tokenizer(src) {
                    const match = src.match(/^==([^=]+)==/);
                    if (match) {
                        return {
                            type: 'highlight',
                            raw: match[0],
                            text: match[1]
                        };
                    }
                },
                renderer(token) {
                    return `<mark>${token.text}</mark>`;
                }
            }]
        });
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
     * 使用 DOMPurify 替代正则过滤
     */
    _sanitize(html) {
        if (typeof DOMPurify === 'undefined') {
            console.error('DOMPurify not loaded, falling back to basic regex sanitization');
            return this._regexSanitize(html);
        }

        return DOMPurify.sanitize(html, {
            ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'div', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'strong', 'em', 'del', 'br', 'hr', 'input', 'figure', 'figcaption', 'mark', 'button', 'details', 'summary'],
            ALLOWED_ATTR: ['href', 'title', 'class', 'id', 'src', 'alt', 'loading', 'type', 'checked', 'disabled', 'target', 'rel', 'style', 'data-lang', 'start', 'aria-label', 'open'],
            ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|file|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
            FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'object', 'embed'],
            FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus', 'onblur'],
            ALLOW_DATA_ATTR: true
        });
    }

    /**
     * 正则过滤兜底方案 (仅当 DOMPurify 加载失败时使用)
     * 移除危险标签和属性
     */
    _regexSanitize(html) {
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
