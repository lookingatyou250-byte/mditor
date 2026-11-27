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

        // 表格：外包横向滚动容器，支持宽表自动向外舒展且超宽不裁切
        renderer.table = (header, body) => {
            const tbody = body ? `<tbody>\n${body}</tbody>\n` : '';
            return `<div class="md-table-wrap"><table>\n<thead>\n${header}</thead>\n${tbody}</table></div>\n`;
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
     * 获取当前文档分类（Markdown / 代码 / CSV / 纯文本）
     */
    classifyDocument(fileName) {
        if (!fileName || fileName === '欢迎' || fileName === '未命名') {
            return { kind: 'markdown', lang: 'markdown', label: 'Markdown', ext: '.md' };
        }
        if (typeof window !== 'undefined' && window.MditorFileTypes?.classifyFile) {
            return window.MditorFileTypes.classifyFile(fileName);
        }
        return { kind: 'markdown', lang: 'markdown', label: 'Markdown', ext: '.md' };
    }

    /**
     * 解析文档（自动识别 Markdown / 代码 / 配置 / CSV / 纯文本）
     * @param {string} content - 文档原始文本
     * @param {string|null} fileName - 文件名或路径
     * @returns {string} HTML 字符串
     */
    parse(content, fileName = null) {
        if (!content) return '';

        const info = this.classifyDocument(fileName);
        if (info.kind === 'code') {
            return this._renderCodeDocument(content, info);
        }
        if (info.kind === 'csv' || info.kind === 'tsv') {
            return this._renderDelimitedTable(content, info);
        }
        if (info.kind === 'text') {
            return this._renderPlainTextDocument(content, info);
        }

        try {
            this._headingSlugCounts = new Map();
            this._taskItemIndex = 0;

            // 提取并处理 GFM 脚注 ([^id]: content)
            const { cleanedMarkdown, footnotes } = this._extractFootnotes(content);

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
     * 渲染代码 / 配置文件视图（复用内置 highlight.js + 行号 + 大文件降级）
     */
    _renderCodeDocument(content, info) {
        let displayContent = content;
        let prettyFormatted = false;

        // 对压缩成单行/极少行的 JSON (< 500 KB) 自动优雅缩进预览（不改动原文件）
        if (info.lang === 'json' && content.length <= 512 * 1024) {
            const rawLines = content.split(/\r?\n/);
            if (rawLines.length <= 3 && content.trim().length > 160) {
                try {
                    const parsed = JSON.parse(content);
                    displayContent = JSON.stringify(parsed, null, 2);
                    prettyFormatted = true;
                } catch {
                    // JSONC 或非法 JSON 保持原样
                }
            }
        }

        const isLarge = displayContent.length > 1024 * 1024;
        const lines = displayContent.split(/\r?\n/);
        const lineCount = lines.length;
        const lang = this._escapeHtml(info.lang || 'plaintext');
        const label = this._escapeHtml(info.label || lang.toUpperCase());
        const escapedCode = this._escapeHtml(displayContent);

        let gutterHtml = '';
        if (lineCount <= 12000) {
            const parts = new Array(lineCount);
            for (let i = 1; i <= lineCount; i++) {
                parts[i - 1] = `<span class="code-line-num" id="code-line-${i}">${i}</span>`;
            }
            gutterHtml = `<div class="code-view-gutter" aria-hidden="true">${parts.join('')}</div>`;
        }

        const badges = [
            `<span class="doc-meta-badge">${label}</span>`,
            `<span class="doc-meta-info">${lineCount} 行</span>`
        ];
        if (prettyFormatted) {
            badges.push(`<span class="doc-meta-pill">已自动格式化预览</span>`);
        }
        if (isLarge) {
            badges.push(`<span class="doc-meta-pill">大文件 · 轻量模式</span>`);
        }

        const preClass = isLarge ? 'code-view-pre no-highlight' : 'code-view-pre';
        return `<div class="doc-code-view" data-doc-kind="code" data-lang="${lang}">
  <div class="doc-view-header">
    <div class="doc-meta-group">${badges.join('')}</div>
    <button class="code-copy-btn doc-copy-btn" type="button" title="复制全部内容" aria-label="复制全部">复制全部</button>
  </div>
  <div class="code-view-body">
    ${gutterHtml}
    <pre class="${preClass}" data-lang="${lang}"><code class="language-${lang}">${escapedCode}</code></pre>
  </div>
</div>`;
    }

    /**
     * 渲染纯文本 / 日志视图（记事本风格：严格保留空格与换行，不按 Markdown 误解析）
     */
    _renderPlainTextDocument(content, info) {
        const lineCount = content.split(/\r?\n/).length;
        const label = this._escapeHtml(info.label || '纯文本');
        const escaped = this._escapeHtml(content);

        return `<div class="doc-plain-view" data-doc-kind="text">
  <div class="doc-view-header">
    <div class="doc-meta-group">
      <span class="doc-meta-badge">${label}</span>
      <span class="doc-meta-info">${lineCount} 行</span>
    </div>
    <button class="code-copy-btn doc-copy-btn" type="button" title="复制全部内容" aria-label="复制全部">复制全部</button>
  </div>
  <pre class="plain-view-body"><code>${escaped}</code></pre>
</div>`;
    }

    /**
     * 渲染 CSV / TSV 表格视图（零依赖 RFC-4180 解析器）
     */
    _renderDelimitedTable(content, info) {
        const delimiter = info.kind === 'tsv' ? '\t' : ',';
        const rows = this._parseDelimited(content, delimiter);
        const totalRows = rows.length;
        const maxDisplayRows = 3000;
        const truncated = totalRows > maxDisplayRows;
        const visibleRows = truncated ? rows.slice(0, maxDisplayRows) : rows;
        const colCount = visibleRows.reduce((max, r) => Math.max(max, r.length), 0);

        if (visibleRows.length === 0) {
            return this._renderPlainTextDocument(content, info);
        }

        const headerRow = visibleRows[0];
        const bodyRows = visibleRows.slice(1);

        let theadCells = '<th class="csv-row-num">#</th>';
        for (let c = 0; c < colCount; c++) {
            theadCells += `<th>${this._escapeHtml(headerRow[c] || '')}</th>`;
        }

        const tbodyParts = new Array(bodyRows.length);
        for (let r = 0; r < bodyRows.length; r++) {
            const row = bodyRows[r];
            let cells = `<td class="csv-row-num">${r + 1}</td>`;
            for (let c = 0; c < colCount; c++) {
                cells += `<td>${this._escapeHtml(row[c] || '')}</td>`;
            }
            tbodyParts[r] = `<tr>${cells}</tr>`;
        }

        const label = this._escapeHtml(info.label || 'CSV 表格');
        const truncatePill = truncated
            ? `<span class="doc-meta-pill">已预览前 ${maxDisplayRows} 行（共 ${totalRows} 行）</span>`
            : '';

        return `<div class="doc-table-view" data-doc-kind="${info.kind}">
  <div class="doc-view-header">
    <div class="doc-meta-group">
      <span class="doc-meta-badge">${label}</span>
      <span class="doc-meta-info">${Math.max(0, totalRows - 1)} 行 · ${colCount} 列</span>
      ${truncatePill}
    </div>
  </div>
  <div class="doc-table-scroll">
    <table class="csv-table">
      <thead><tr>${theadCells}</tr></thead>
      <tbody>${tbodyParts.join('')}</tbody>
    </table>
  </div>
</div>`;
    }

    /**
     * 轻量 RFC-4180 CSV/TSV 解析器
     */
    _parseDelimited(text, delimiter) {
        const rows = [];
        let row = [];
        let field = '';
        let inQuotes = false;
        const len = text.length;

        for (let i = 0; i < len; i++) {
            const ch = text[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (i + 1 < len && text[i + 1] === '"') {
                        field += '"';
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    field += ch;
                }
            } else {
                if (ch === '"' && field.length === 0) {
                    inQuotes = true;
                } else if (ch === delimiter) {
                    row.push(field);
                    field = '';
                } else if (ch === '\r' || ch === '\n') {
                    if (ch === '\r' && i + 1 < len && text[i + 1] === '\n') i++;
                    row.push(field);
                    if (row.length > 1 || row[0] !== '') {
                        rows.push(row);
                    }
                    row = [];
                    field = '';
                } else {
                    field += ch;
                }
            }
        }
        if (field.length > 0 || row.length > 0) {
            row.push(field);
            if (row.length > 1 || row[0] !== '') {
                rows.push(row);
            }
        }
        return rows;
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
     * 提取大纲（Markdown 提取标题；代码/YAML/JSON 提取轻量顶层结构符号）
     * @param {string} content - 文档文本
     * @param {string|null} fileName - 文件名
     * @returns {Array} 大纲数组
     */
    extractOutline(content, fileName = null) {
        if (!content) return [];

        const info = this.classifyDocument(fileName);
        if (info.kind === 'code') {
            return this._extractCodeOutline(content, info.lang);
        }
        if (info.kind !== 'markdown') {
            return [];
        }

        const outline = [];
        const slugCounts = new Map();
        const lines = content.split('\n');
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

    /**
     * 轻量代码结构大纲提取（零 AST 依赖，按常见函数/类/顶层键快速索引）
     */
    _extractCodeOutline(content, lang) {
        if (content.length > 1024 * 1024) return [];
        const outline = [];
        const lines = content.split(/\r?\n/);
        const maxItems = 200;

        for (let i = 0; i < lines.length && outline.length < maxItems; i++) {
            const line = lines[i];
            const lineNum = i + 1;
            let match = null;
            let level = 1;
            let text = '';

            if (lang === 'javascript' || lang === 'typescript') {
                if ((match = line.match(/^\s*(?:export\s+)?(?:default\s+)?class\s+([A-Za-z0-9_$]+)/))) {
                    level = 1;
                    text = `class ${match[1]}`;
                } else if ((match = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z0-9_$]+)\s*\(/))) {
                    level = 2;
                    text = `${match[1]}()`;
                } else if ((match = line.match(/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*=>/))) {
                    level = 2;
                    text = `${match[1]}()`;
                } else if ((match = line.match(/^    (?:async\s+)?([A-Za-z_][A-Za-z0-9_$]*)\s*\([^)]*\)\s*\{/)) && !['if', 'for', 'while', 'switch', 'catch'].includes(match[1])) {
                    level = 2;
                    text = `${match[1]}()`;
                }
            } else if (lang === 'python') {
                if ((match = line.match(/^class\s+([A-Za-z0-9_]+)/))) {
                    level = 1;
                    text = `class ${match[1]}`;
                } else if ((match = line.match(/^(\s*)(?:async\s+)?def\s+([A-Za-z0-9_]+)\s*\(/))) {
                    level = match[1].length > 0 ? 2 : 1;
                    text = `def ${match[2]}()`;
                }
            } else if (lang === 'go' || lang === 'rust' || lang === 'swift') {
                if ((match = line.match(/^\s*(?:pub\s+|public\s+|private\s+)?(?:struct|class|enum|interface|protocol|trait|impl)\s+([A-Za-z0-9_]+)/))) {
                    level = 1;
                    text = match[1];
                } else if ((match = line.match(/^\s*(?:pub\s+|public\s+|private\s+)?(?:async\s+)?(?:func|fn)\s+(?:\([^)]*\)\s*)?([A-Za-z0-9_]+)/))) {
                    level = 2;
                    text = `${match[1]}()`;
                }
            } else if (lang === 'yaml') {
                if ((match = line.match(/^([A-Za-z0-9_.-]+):\s*(?:#.*)?$/))) {
                    level = 1;
                    text = match[1];
                }
            } else if (lang === 'json') {
                if ((match = line.match(/^  "([^"]+)"\s*:/))) {
                    level = 1;
                    text = match[1];
                }
            } else if (lang === 'bash' || lang === 'shell') {
                if ((match = line.match(/^(?:function\s+)?([A-Za-z_][A-Za-z0-9_-]*)\s*\(\)\s*\{/))) {
                    level = 1;
                    text = `${match[1]}()`;
                }
            }

            if (text) {
                outline.push({
                    level,
                    text,
                    id: `code-line-${lineNum}`,
                    line: lineNum
                });
            }
        }

        return outline;
    }
}
