/**
 * Markdown Parser - Markdown 解析模块
 * 封装 marked.js，提供安全的解析功能
 */
class MarkdownParser {
    constructor(eventBus, state) {
        this.eventBus = eventBus;
        this.state = state;
        this.baseDir = null;
        this._headingSlugCounts = new Map();
        this._taskItemIndex = 0;
        this._configureMarked();
    }

    /**
     * 统一生成标题 ID（兼顾渲染后的 HTML 与原始 Markdown 文本，并处理重名标题）
     */
    _generateHeadingId(rawText, slugCounts = this._headingSlugCounts) {
        const plain = String(rawText || '')
            .replace(/<[^>]*>/g, '')                    // 移除 HTML 标签
            .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')   // 图片取 alt
            .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')    // 链接取文本
            .replace(/(`{1,3})([^`]+)\1/g, '$2')        // 行内代码
            .replace(/(\*\*|__|\*|_|~~|==)/g, '')       // 粗体/斜体/删除线/高亮符号
            .trim()
            .toLowerCase();

        const baseSlug = plain
            .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'section';

        if (!slugCounts) {
            return `heading-${baseSlug}`;
        }

        const count = slugCounts.get(baseSlug) || 0;
        slugCounts.set(baseSlug, count + 1);
        return count === 0 ? `heading-${baseSlug}` : `heading-${baseSlug}-${count}`;
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

        // 代码块：支持 Mermaid 图表、Math 公式块，或常规语法高亮 + 一键复制按钮
        renderer.code = (code, language) => {
            const rawLang = (language || '').trim().toLowerCase();
            const escapedCode = this._escapeHtml(code);

            if (rawLang === 'mermaid') {
                return `<div class="mermaid-block" data-lang="mermaid"><div class="mermaid-toolbar"><span class="mermaid-label">Mermaid 图表</span><button class="code-copy-btn" type="button" title="复制 Mermaid 源码" aria-label="复制代码">复制源码</button></div><pre class="mermaid-source" hidden><code>${escapedCode}</code></pre><div class="mermaid-diagram">图表加载中...</div></div>`;
            }

            if (rawLang === 'math' || rawLang === 'latex' || rawLang === 'katex') {
                const encoded = encodeURIComponent(code.trim());
                return `<div class="math-block" data-math-uri="${encoded}">$$${escapedCode}$$</div>`;
            }

            const lang = this._escapeHtml(language || 'plaintext');
            return `<pre class="code-block" data-lang="${lang}"><button class="code-copy-btn" type="button" title="复制代码" aria-label="复制代码">复制</button><code class="language-${lang}">${escapedCode}</code></pre>`;
        };

        // 引用块：支持 GitHub / Obsidian 风格 Callout (> [!NOTE], > [!TIP], > [!WARNING] 等)
        renderer.blockquote = (quote) => {
            const calloutMatch = quote.match(/^\s*<p>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|INFO|SUCCESS|QUESTION|DANGER|BUG|EXAMPLE|QUOTE)\](?:[ \t]+([^\n<]*))?(?:<br\s*\/?>|\n|(<\/p>))([\s\S]*)$/i);
            if (calloutMatch) {
                const rawType = calloutMatch[1].toUpperCase();
                const customTitle = (calloutMatch[2] || '').trim();
                const closedFirstParagraph = Boolean(calloutMatch[3]);
                const rest = calloutMatch[4] || '';

                const typeMeta = {
                    NOTE: { cls: 'note', label: '备注', icon: 'ℹ' },
                    INFO: { cls: 'note', label: '信息', icon: 'ℹ' },
                    TIP: { cls: 'tip', label: '提示', icon: '✦' },
                    SUCCESS: { cls: 'tip', label: '成功', icon: '✓' },
                    IMPORTANT: { cls: 'important', label: '重要', icon: '★' },
                    EXAMPLE: { cls: 'important', label: '示例', icon: '❖' },
                    WARNING: { cls: 'warning', label: '警告', icon: '⚠' },
                    QUESTION: { cls: 'warning', label: '问题', icon: '?' },
                    CAUTION: { cls: 'caution', label: '注意', icon: '!' },
                    DANGER: { cls: 'caution', label: '危险', icon: '!' },
                    BUG: { cls: 'caution', label: '缺陷', icon: '!' },
                    QUOTE: { cls: 'quote', label: '引用', icon: '“' }
                };

                const meta = typeMeta[rawType] || typeMeta.NOTE;
                const title = customTitle || meta.label;
                const bodyHtml = closedFirstParagraph ? rest : `<p>${rest}`;

                return `<div class="callout callout-${meta.cls}" data-callout="${meta.cls}"><div class="callout-title"><span class="callout-icon">${meta.icon}</span><span class="callout-title-text">${title}</span></div><div class="callout-content">${bodyHtml}</div></div>`;
            }
            return `<blockquote>${quote}</blockquote>`;
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

        // 任务列表（支持阅读模式下点击切换状态，并移除 marked 默认自带的禁用复选框避免重复）
        renderer.listitem = (text, task, checked) => {
            if (task) {
                const idx = this._taskItemIndex++;
                const checkedAttr = checked ? ' checked' : '';
                const cleanText = text.replace(/^(<p>\s*)?<input[^>]*type=["']checkbox["'][^>]*>\s*/i, '$1');
                return `<li class="task-list-item"><input type="checkbox" class="task-checkbox" data-task-index="${idx}"${checkedAttr}><span class="task-item-text">${cleanText}</span></li>`;
            }
            return `<li>${text}</li>`;
        };

        // 标题：使用与 extractOutline 一致的 ID 生成算法（支持重名标题区分）
        renderer.heading = (text, level) => {
            const id = this._generateHeadingId(text, this._headingSlugCounts);
            return `<h${level} id="${id}">${text}</h${level}>`;
        };

        // 有序列表：保留 start 属性
        renderer.list = (body, ordered, start) => {
            const tag = ordered ? 'ol' : 'ul';
            const startAttr = (ordered && start !== 1) ? ` start="${start}"` : '';
            return `<${tag}${startAttr}>${body}</${tag}>`;
        };

        marked.use({ renderer });

        const self = this;

        // 扩展：块级公式 ($$...$$)、行内公式 ($...$)、高亮 (==text==)
        marked.use({
            extensions: [
                {
                    name: 'blockMath',
                    level: 'block',
                    start(src) {
                        const idx = src.indexOf('$$');
                        return idx >= 0 ? idx : undefined;
                    },
                    tokenizer(src) {
                        const match = src.match(/^\$\$([\s\S]+?)\$\$(?:\n|$)/);
                        if (match) {
                            return {
                                type: 'blockMath',
                                raw: match[0],
                                text: match[1].trim()
                            };
                        }
                    },
                    renderer(token) {
                        const escaped = self._escapeHtml(token.text);
                        const encoded = encodeURIComponent(token.text);
                        return `<div class="math-block" data-math-uri="${encoded}">$$${escaped}$$</div>\n`;
                    }
                },
                {
                    name: 'inlineMath',
                    level: 'inline',
                    start(src) {
                        const idx = src.indexOf('$');
                        return idx >= 0 ? idx : undefined;
                    },
                    tokenizer(src) {
                        if (src.startsWith('$$')) return;
                        const match = src.match(/^\$([^\$\n]+?)\$(?!\d)/);
                        if (match && match[1].trim()) {
                            return {
                                type: 'inlineMath',
                                raw: match[0],
                                text: match[1].trim()
                            };
                        }
                    },
                    renderer(token) {
                        const escaped = self._escapeHtml(token.text);
                        const encoded = encodeURIComponent(token.text);
                        return `<span class="math-inline" data-math-uri="${encoded}">$${escaped}$</span>`;
                    }
                },
                {
                    name: 'highlight',
                    level: 'inline',
                    start(src) { return src.indexOf('=='); },
                    tokenizer(src) {
                        const match = src.match(/^==([^=\n]+)==/);
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
                }
            ]
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
     * 解析 Markdown（支持 GFM 脚注、KaTeX 公式、Mermaid 图表与 Callout）
     * @param {string} markdown - Markdown 文本
     * @returns {string} HTML 字符串
     */
    parse(markdown) {
        if (!markdown) return '';

        try {
            this._headingSlugCounts = new Map();
            this._taskItemIndex = 0;

            // 提取并处理 GFM 脚注 ([^id]: content)
            const { cleanedMarkdown, footnotes } = this._extractFootnotes(markdown);

            let html = marked.parse(cleanedMarkdown);

            // 替换正文中的脚注引用 [^id] 并附加底部脚注列表
            if (footnotes.size > 0) {
                html = this._renderFootnotes(html, footnotes);
            }

            return this._sanitize(html);
        } catch (error) {
            console.error('Parse error:', error);
            return `<p class="parse-error">解析错误: ${error.message}</p>`;
        }
    }

    /**
     * 提取 Markdown 中的脚注定义（忽略代码块内部）
     */
    _extractFootnotes(markdown) {
        const footnotes = new Map();
        const lines = markdown.split('\n');
        const keptLines = [];
        let inCodeBlock = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.trim().startsWith('```')) {
                inCodeBlock = !inCodeBlock;
                keptLines.push(line);
                continue;
            }
            if (!inCodeBlock) {
                const match = line.match(/^\[\^([^\]]+)\]:\s*(.+)$/);
                if (match) {
                    const id = match[1].trim();
                    footnotes.set(id, match[2].trim());
                    continue;
                }
            }
            keptLines.push(line);
        }

        return {
            cleanedMarkdown: keptLines.join('\n'),
            footnotes
        };
    }

    /**
     * 渲染脚注引用与底部脚注区
     */
    _renderFootnotes(html, footnotes) {
        const usedOrder = [];
        const usedMap = new Map();

        const replaced = html.replace(/\[\^([^\]]+)\]/g, (full, rawId) => {
            const id = String(rawId).trim();
            if (!footnotes.has(id)) return full;
            let num = usedMap.get(id);
            if (!num) {
                usedOrder.push(id);
                num = usedOrder.length;
                usedMap.set(id, num);
            }
            const safeId = this._escapeHtml(id.replace(/[^\w\u4e00-\u9fa5-]/g, '-'));
            return `<sup class="footnote-ref"><a href="#fn-${safeId}" id="fnref-${safeId}" title="跳转到脚注 ${num}">[${num}]</a></sup>`;
        });

        if (usedOrder.length === 0) return replaced;

        const itemsHtml = usedOrder.map((id) => {
            const safeId = this._escapeHtml(id.replace(/[^\w\u4e00-\u9fa5-]/g, '-'));
            const content = this._escapeHtml(footnotes.get(id) || '');
            return `<li id="fn-${safeId}" class="footnote-item"><span class="footnote-text">${content}</span> <a href="#fnref-${safeId}" class="footnote-backref" title="返回正文">↩</a></li>`;
        }).join('');

        return `${replaced}\n<section class="footnotes"><hr><ol class="footnotes-list">${itemsHtml}</ol></section>`;
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
            ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'div', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'strong', 'em', 'del', 'br', 'hr', 'input', 'figure', 'figcaption', 'mark', 'button', 'details', 'summary', 'sup', 'sub', 'section', 'kbd'],
            ALLOWED_ATTR: ['href', 'title', 'class', 'id', 'src', 'alt', 'loading', 'type', 'checked', 'disabled', 'target', 'rel', 'style', 'data-lang', 'data-math', 'data-math-uri', 'data-mermaid', 'data-callout', 'data-task-index', 'hidden', 'start', 'aria-label', 'open'],
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
        const slugCounts = new Map();
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
                const rawHeading = match[2].trim();
                const displayText = rawHeading
                    .replace(/<[^>]*>/g, '')
                    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
                    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
                    .replace(/(`{1,3})([^`]+)\1/g, '$2')
                    .replace(/(\*\*|__|\*|_|~~|==)/g, '')
                    .trim();
                const id = this._generateHeadingId(rawHeading, slugCounts);

                outline.push({
                    level,
                    text: displayText || rawHeading,
                    id,
                    line: index + 1
                });
            }
        });

        return outline;
    }
}
