/**
 * CodeMirror 6 Editor Module
 * 源码编辑模式，风格化接近阅读模式
 */
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';

// 自定义主题配置 - 匹配 mditor 的阅读模式风格
const mditorTheme = EditorView.theme({
    '&': {
        fontSize: '16px',
        fontFamily: '"Noto Serif SC", Georgia, serif',
        backgroundColor: 'transparent'
    },
    '.cm-content': {
        fontFamily: '"Noto Serif SC", Georgia, serif',
        lineHeight: '1.8',
        padding: '2rem 0',
        caretColor: 'var(--color-primary)'
    },
    '.cm-line': {
        padding: '0 2rem'
    },
    '.cm-cursor': {
        borderLeftWidth: '2px',
        borderLeftColor: 'var(--color-primary)'
    },
    '.cm-selectionBackground': {
        backgroundColor: 'var(--color-primary-light, rgba(102, 126, 234, 0.2)) !important'
    },
    '&.cm-focused .cm-selectionBackground': {
        backgroundColor: 'var(--color-primary-light, rgba(102, 126, 234, 0.3)) !important'
    },
    '.cm-activeLine': {
        backgroundColor: 'var(--color-bg-elevated, rgba(0,0,0,0.02))'
    },
    '.cm-gutters': {
        backgroundColor: 'transparent',
        borderRight: 'none',
        color: 'var(--color-text-tertiary)',
        fontSize: '12px',
        opacity: '0',
        transition: 'opacity 0.2s ease'
    },
    '&:hover .cm-gutters': {
        opacity: '1'
    },
    // Markdown 语法高亮
    '.cm-header-1': { fontSize: '2rem', fontWeight: '700', color: 'var(--color-text-primary)' },
    '.cm-header-2': { fontSize: '1.6rem', fontWeight: '600', color: 'var(--color-text-primary)' },
    '.cm-header-3': { fontSize: '1.3rem', fontWeight: '600', color: 'var(--color-text-primary)' },
    '.cm-header-4': { fontSize: '1.1rem', fontWeight: '600', color: 'var(--color-text-primary)' },
    '.cm-strong': { fontWeight: '700' },
    '.cm-emphasis': { fontStyle: 'italic' },
    '.cm-strikethrough': { textDecoration: 'line-through' },
    '.cm-link': { color: 'var(--color-primary)', textDecoration: 'underline' },
    '.cm-url': { color: 'var(--color-text-secondary)', fontFamily: '"JetBrains Mono", monospace', fontSize: '0.9em' },
    '.cm-monospace': { fontFamily: '"JetBrains Mono", monospace', fontSize: '0.9em' }
}, { dark: false });

// 暗色模式覆盖
const mditorDarkTheme = EditorView.theme({
    '.cm-activeLine': {
        backgroundColor: 'rgba(255,255,255,0.05)'
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
                ...defaultKeymap,
                ...historyKeymap,
                indentWithTab
            ]),

            // Markdown 支持
            markdown(),
            syntaxHighlighting(defaultHighlightStyle, { fallback: true }),

            // 自定义主题
            mditorTheme,
            this.isDark ? oneDark : [],

            // 自动换行
            EditorView.lineWrapping,

            // 内容变化监听
            EditorView.updateListener.of(update => {
                if (update.docChanged) {
                    this.onChange(update.state.doc.toString());
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
     * 切换主题
     */
    setDarkMode(isDark) {
        // 重新创建编辑器以应用新主题
        if (this.view && this.container) {
            const content = this.getValue();
            this.destroy();
            this.isDark = isDark;
            this.init(this.container, content, { onChange: this.onChange, isDark });
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
