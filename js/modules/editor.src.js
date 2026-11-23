/**
 * CodeMirror 6 Editor Module
 * 源码编辑模式，风格化接近阅读模式
 */
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, placeholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';

// 自定义主题配置
const mditorTheme = EditorView.theme({
    '&': {
        fontSize: 'var(--editor-font-size, 16px)',
        fontFamily: '"Mditor Legacy Serif", Georgia, serif',
        backgroundColor: 'transparent'
    },
    '.cm-content': {
        fontFamily: '"Mditor Legacy Serif", Georgia, serif',
        lineHeight: '1.8',
        padding: '2rem 0',
        caretColor: 'var(--color-accent)'
    },
    '.cm-line': {
        padding: '0 2rem'
    },
    '.cm-cursor': {
        borderLeftWidth: '2px',
        borderLeftColor: 'var(--color-accent)'
    },
    '.cm-selectionBackground': {
        backgroundColor: 'var(--color-primary-light, rgba(217, 119, 87, 0.20)) !important'
    },
    '&.cm-focused .cm-selectionBackground': {
        backgroundColor: 'var(--color-primary-light, rgba(217, 119, 87, 0.26)) !important'
    },
    '.cm-activeLine': {
        backgroundColor: 'var(--bg-elevated, rgba(61, 57, 41, 0.035))'
    },
    '.cm-gutters': {
        backgroundColor: 'transparent',
        borderRight: 'none',
        color: 'var(--text-tertiary)',
        fontSize: '12px',
        opacity: '0',
        transition: 'opacity 0.2s ease'
    },
    '&:hover .cm-gutters': {
        opacity: '1'
    },
    // Markdown 语法高亮
    '.cm-header-1': { fontSize: '2rem', fontWeight: '700', color: 'var(--text-primary)' },
    '.cm-header-2': { fontSize: '1.6rem', fontWeight: '600', color: 'var(--text-primary)' },
    '.cm-header-3': { fontSize: '1.3rem', fontWeight: '600', color: 'var(--text-primary)' },
    '.cm-header-4': { fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-primary)' },
    '.cm-strong': { fontWeight: '700' },
    '.cm-emphasis': { fontStyle: 'italic' },
    '.cm-strikethrough': { textDecoration: 'line-through' },
    '.cm-link': { color: 'var(--color-accent-hover)', textDecoration: 'underline' },
    '.cm-url': { color: 'var(--text-secondary)', fontFamily: '"Mditor Legacy Mono", monospace', fontSize: '0.9em' },
    '.cm-monospace': { fontFamily: '"Mditor Legacy Mono", monospace', fontSize: '0.9em' },
    // 幽灵提示样式
    '.cm-placeholder': {
        color: 'var(--text-tertiary, #96938A)',
        fontStyle: 'italic'
    }
}, { dark: false });

// 暗色模式覆盖 - 保持 Claude 暖炭黑透明画布，避免 oneDark 冷蓝背景违和
const mditorDarkTheme = EditorView.theme({
    '&': {
        color: 'var(--text-primary, #ECE8DF)',
        backgroundColor: 'transparent'
    },
    '.cm-content': {
        color: 'var(--text-primary, #ECE8DF)',
        caretColor: 'var(--color-accent, #D97757)'
    },
    '.cm-activeLine': {
        backgroundColor: 'var(--bg-elevated, rgba(245, 238, 224, 0.045))'
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
        backgroundColor: 'var(--color-primary-light, rgba(217, 119, 87, 0.26)) !important'
    }
}, { dark: true });

/**
 * 编辑器类
 */
class MditorEditor {
    constructor() {
        this.view = null;
        this.container = null;
        this.onChange = null;
        this.onScroll = null;
        this.isDark = false;
    }

    /**
     * 初始化编辑器
     * @param {HTMLElement} container 容器元素
     * @param {string} initialContent 初始内容
     * @param {Object} options 配置
     */
    init(container, initialContent = '', options = {}) {
        this.container = container;
        this.onChange = options.onChange || (() => { });
        this.onScroll = options.onScroll || null;
        this.isDark = options.isDark || false;

        const extensions = [
            // 基础功能
            lineNumbers(),
            highlightActiveLine(),
            highlightActiveLineGutter(),
            drawSelection(),
            rectangularSelection(),
            bracketMatching(),
            history(),

            // 快捷键
            keymap.of([
                {
                    key: 'Mod-b',
                    run: () => {
                        this.toggleBold();
                        return true;
                    }
                },
                {
                    key: 'Mod-i',
                    run: () => {
                        this.toggleItalic();
                        return true;
                    }
                },
                ...defaultKeymap,
                ...historyKeymap,
                indentWithTab
            ]),

            // Markdown 支持
            markdown(),
            syntaxHighlighting(defaultHighlightStyle, { fallback: true }),

            // 自定义主题
            mditorTheme,
            this.isDark ? [oneDark, mditorDarkTheme] : [],

            // 自动换行
            EditorView.lineWrapping,

            // 幽灵提示（空文档时显示）
            placeholder('输入 // 插入格式...'),

            // 内容变化监听
            EditorView.updateListener.of(update => {
                if (update.docChanged) {
                    this.onChange(update.state.doc.toString());
                }
            }),

            // 滚动同步监听
            EditorView.domEventHandlers({
                scroll: (_event, view) => {
                    if (!this.onScroll) return;
                    const maxScroll = view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight;
                    const percentage = maxScroll > 0 ? view.scrollDOM.scrollTop / maxScroll : 0;
                    this.onScroll(Math.max(0, Math.min(1, percentage)));
                }
            })
        ];

        this.view = new EditorView({
            state: EditorState.create({
                doc: initialContent,
                extensions: extensions.flat()
            }),
            parent: container
        });

        return this;
    }

    /**
     * 获取内容
     */
    getValue() {
        return this.view?.state.doc.toString() || '';
    }

    /**
     * 设置内容
     */
    setValue(content) {
        if (!this.view) return;

        this.view.dispatch({
            changes: {
                from: 0,
                to: this.view.state.doc.length,
                insert: content
            }
        });
    }

    /**
     * 聚焦编辑器
     */
    focus() {
        this.view?.focus();
    }

    /**
     * 获取当前滚动百分比 (0 ~ 1)
     */
    getScrollPercentage() {
        const scroller = this.view?.scrollDOM;
        if (!scroller) return 0;
        const maxScroll = scroller.scrollHeight - scroller.clientHeight;
        if (maxScroll <= 0) return 0;
        return Math.max(0, Math.min(1, scroller.scrollTop / maxScroll));
    }

    /**
     * 按百分比设置滚动位置 (0 ~ 1)
     */
    setScrollPercentage(percentage) {
        const scroller = this.view?.scrollDOM;
        if (!scroller) return;
        const clamped = Math.max(0, Math.min(1, Number(percentage) || 0));
        const maxScroll = scroller.scrollHeight - scroller.clientHeight;
        scroller.scrollTop = maxScroll > 0 ? maxScroll * clamped : 0;
    }

    /**
     * 切换主题
     */
    setDarkMode(isDark) {
        // 重新创建编辑器以应用新主题
        if (this.view && this.container) {
            const content = this.getValue();
            const scrollRatio = this.getScrollPercentage();
            this.destroy();
            this.isDark = isDark;
            this.init(this.container, content, {
                onChange: this.onChange,
                onScroll: this.onScroll,
                isDark
            });
            requestAnimationFrame(() => this.setScrollPercentage(scrollRatio));
        }
    }

    /**
     * 销毁编辑器
     */
    destroy() {
        this.view?.destroy();
        this.view = null;
    }

    /**
     * 插入 Markdown 语法
     */
    insertSyntax(syntax, wrap = false) {
        if (!this.view) return;

        const { from, to } = this.view.state.selection.main;
        const selectedText = this.view.state.sliceDoc(from, to);

        let insertText;
        let cursorOffset;

        if (wrap && selectedText) {
            // 包裹选中文本
            insertText = `${syntax}${selectedText}${syntax}`;
            cursorOffset = insertText.length;
        } else if (wrap) {
            // 插入占位符
            insertText = `${syntax}文本${syntax}`;
            cursorOffset = syntax.length;
        } else {
            insertText = syntax;
            cursorOffset = syntax.length;
        }

        this.view.dispatch({
            changes: { from, to, insert: insertText },
            selection: { anchor: from + cursorOffset }
        });

        this.focus();
    }

    // 快捷方法
    toggleBold() { this.insertSyntax('**', true); }
    toggleItalic() { this.insertSyntax('*', true); }
    toggleCode() { this.insertSyntax('`', true); }
    insertHeading(level) {
        const prefix = '#'.repeat(level) + ' ';
        const { from } = this.view.state.selection.main;
        const line = this.view.state.doc.lineAt(from);
        this.view.dispatch({
            changes: { from: line.from, to: line.from, insert: prefix }
        });
    }
}

// 导出编辑器类
window.MditorEditor = MditorEditor;
