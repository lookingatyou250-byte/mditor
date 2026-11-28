const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const repoRoot = path.join(__dirname, '..');
const readRepoFile = (relPath) => fs.readFileSync(path.join(repoRoot, relPath), 'utf8');

class FakeClassList {
    constructor(owner) {
        this.owner = owner;
        this.set = new Set();
    }
    _syncFromString(str) {
        this.set = new Set(String(str || '').split(/\s+/).filter(Boolean));
    }
    _syncToOwner() {
        this.owner._className = [...this.set].join(' ');
    }
    add(...names) {
        names.filter(Boolean).forEach((n) => this.set.add(n));
        this._syncToOwner();
    }
    remove(...names) {
        names.forEach((n) => this.set.delete(n));
        this._syncToOwner();
    }
    toggle(name, force) {
        const shouldHave = force === undefined ? !this.set.has(name) : Boolean(force);
        if (shouldHave) this.set.add(name);
        else this.set.delete(name);
        this._syncToOwner();
        return shouldHave;
    }
    contains(name) {
        return this.set.has(name);
    }
}

function toCamelCase(kebab) {
    return kebab.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
}

class FakeElement {
    constructor(tagName = 'div') {
        this.tagName = String(tagName).toUpperCase();
        this.id = '';
        this._className = '';
        this.classList = new FakeClassList(this);
        this.dataset = {};
        this.attributes = {};
        this.style = {
            display: '',
            setProperty(k, v) {
                this[k] = v;
            }
        };
        this.children = [];
        this.parentNode = null;
        this.parentElement = null;
        this._textContent = '';
        this.value = '';
        this.scrollTop = 0;
        this.scrollHeight = 100;
        this.clientHeight = 100;
        this.listeners = new Map();
    }

    get className() {
        return this._className;
    }

    set className(val) {
        this._className = String(val || '');
        this.classList._syncFromString(this._className);
    }

    get textContent() {
        if (this.children.length === 0) return this._textContent;
        return this._textContent + this.children.map((c) => c.textContent).join('');
    }

    set textContent(val) {
        this.children = [];
        this._textContent = String(val ?? '');
    }

    set innerHTML(html) {
        this.children = [];
        this._textContent = '';
        const src = String(html || '').trim();
        if (!src) return;
        parseHtmlInto(src, this);
    }

    get innerHTML() {
        return this._textContent;
    }

    appendChild(child) {
        child.parentNode = this;
        child.parentElement = this;
        this.children.push(child);
        return child;
    }

    remove() {
        if (!this.parentNode) return;
        const idx = this.parentNode.children.indexOf(this);
        if (idx >= 0) this.parentNode.children.splice(idx, 1);
        this.parentNode = null;
        this.parentElement = null;
    }

    addEventListener(type, fn) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(fn);
    }

    removeEventListener(type, fn) {
        const arr = this.listeners.get(type);
        if (!arr) return;
        const idx = arr.indexOf(fn);
        if (idx >= 0) arr.splice(idx, 1);
    }

    async dispatch(type, extra = {}) {
        const event = {
            type,
            target: extra.target || this,
            preventDefault() {},
            stopPropagation() {},
            ...extra
        };
        const handlers = [...(this.listeners.get(type) || [])];
        const results = [];
        for (const fn of handlers) {
            results.push(await fn(event));
        }
        if (this.parentElement && type === 'click' && !extra.noBubble) {
            await this.parentElement.dispatch(type, { ...extra, target: event.target });
        }
        return results;
    }

    focus() {}
    select() {}
    scrollIntoView() {}

    matchesSelector(selector) {
        const s = selector.trim();
        if (s.startsWith('#')) return this.id === s.slice(1);
        if (s === '[data-action]') return Object.prototype.hasOwnProperty.call(this.dataset, 'action');
        const attrMatch = s.match(/^\[data-([a-z-]+)="([^"]+)"\]$/);
        if (attrMatch) {
            return this.dataset[toCamelCase(attrMatch[1])] === attrMatch[2];
        }
        const parts = s.split('.').filter(Boolean);
        if (s.startsWith('.')) {
            return parts.every((cls) => this.classList.contains(cls));
        }
        const [tagPart, ...classes] = parts;
        if (tagPart && this.tagName !== tagPart.toUpperCase()) return false;
        return classes.every((cls) => this.classList.contains(cls));
    }

    closest(selector) {
        let cur = this;
        while (cur) {
            if (cur.matchesSelector && cur.matchesSelector(selector)) return cur;
            cur = cur.parentElement;
        }
        return null;
    }

    querySelectorAll(selector) {
        const selectors = selector.split(',').map((part) => part.trim()).filter(Boolean);
        const out = [];
        const visit = (node) => {
            for (const child of node.children) {
                if (selectors.some((sel) => child.matchesSelector(sel))) {
                    out.push(child);
                }
                visit(child);
            }
        };
        visit(this);
        return out;
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }
}

function applyAttributes(el, attrText) {
    const attrRegex = /([a-zA-Z0-9_-]+)(?:="([^"]*)")?/g;
    let m;
    while ((m = attrRegex.exec(attrText)) !== null) {
        const [, name, rawVal = ''] = m;
        el.attributes[name] = rawVal;
        if (name === 'id') el.id = rawVal;
        else if (name === 'class') el.className = rawVal;
        else if (name.startsWith('data-')) {
            el.dataset[toCamelCase(name.slice(5))] = rawVal;
        }
    }
}

function parseHtmlInto(html, root) {
    const voidTags = new Set(['svg', 'path', 'line', 'circle', 'rect', 'polyline', 'input', 'img', 'br', 'hr']);
    const tokenRegex = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9-]+)>|<([a-zA-Z0-9-]+)([^>]*?)(\/?)>|([^<]+)/g;
    const stack = [root];
    let m;
    while ((m = tokenRegex.exec(html)) !== null) {
        const [full, closeTag, openTag, attrs, selfClose, text] = m;
        if (full.startsWith('<!--')) continue;
        const top = stack[stack.length - 1];
        if (closeTag) {
            if (stack.length > 1 && top.tagName === closeTag.toUpperCase()) {
                stack.pop();
            }
        } else if (openTag) {
            const lower = openTag.toLowerCase();
            if (lower === 'svg') {
                // Skip inner SVG markup cleanly
                const endSvg = html.indexOf('</svg>', tokenRegex.lastIndex);
                const el = new FakeElement('svg');
                applyAttributes(el, attrs);
                top.appendChild(el);
                if (endSvg !== -1) {
                    tokenRegex.lastIndex = endSvg + '</svg>'.length;
                }
                continue;
            }
            const el = new FakeElement(openTag);
            applyAttributes(el, attrs);
            top.appendChild(el);
            if (!selfClose && !voidTags.has(lower)) {
                stack.push(el);
            }
        } else if (text && text.trim()) {
            top._textContent += text;
        }
    }
}

class FakeMditorEditor {
    constructor() {
        this.view = null;
        this.container = null;
        this.doc = '';
        this.onChange = null;
        this.isDark = false;
    }

    init(container, initialContent = '', options = {}) {
        this.container = container;
        this.doc = initialContent;
        this.onChange = options.onChange || (() => {});
        this.isDark = Boolean(options.isDark);
        this.view = {
            dom: new FakeElement('div'),
            scrollDOM: { scrollHeight: 100, clientHeight: 100, scrollTop: 0 },
            state: {
                doc: { toString: () => this.doc, lineAt: () => ({ number: 1, from: 0 }) },
                selection: { main: { from: 0, to: 0 } },
                sliceDoc: () => ''
            },
            dispatch: () => {},
            focus: () => {}
        };
        return this;
    }

    getValue() {
        return this.doc;
    }

    setValue(content) {
        const next = String(content ?? '');
        const changed = next !== this.doc;
        this.doc = next;
        if (changed && this.onChange) {
            this.onChange(this.doc);
        }
    }

    userEdit(nextContent) {
        this.doc = String(nextContent ?? '');
        if (this.onChange) {
            this.onChange(this.doc);
        }
    }

    focus() {}
    getScrollPercentage() { return 0; }
    setScrollPercentage() {}
    setDarkMode(isDark) { this.isDark = isDark; }
    destroy() { this.view = null; }
}

/**
 * 构建带真实 main.js IPC + 真实 App 实例 + 独立临时目录的集成测试夹具
 */
function createTestHarness(t) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mditor-reliability-'));
    const userDataDir = path.join(tmpDir, '_userdata');
    fs.mkdirSync(userDataDir, { recursive: true });

    const ipcHandlers = new Map();
    const ipcListeners = new Map();
    const windows = [];
    let saveDialogHandler = async () => ({ canceled: true });
    let failNextSaveError = null;
    const ipcCallLog = [];

    class MockBrowserWindow extends EventEmitter {
        constructor() {
            super();
            this._destroyed = false;
            this.webContents = Object.assign(new EventEmitter(), {
                id: windows.length + 1,
                send: () => {},
                setWindowOpenHandler: () => {},
                printToPDF: async () => Buffer.from('')
            });
            windows.push(this);
        }
        loadFile() {}
        show() {}
        focus() {}
        restore() {}
        isMinimized() { return false; }
        isMaximized() { return false; }
        isDestroyed() { return this._destroyed; }
        setMenuBarVisibility() {}
        setAutoHideMenuBar() {}
        destroy() {
            this._destroyed = true;
            this.emit('closed');
        }
    }
    MockBrowserWindow.getAllWindows = () => windows;
    MockBrowserWindow.getFocusedWindow = () => windows[0] || null;
    MockBrowserWindow.fromWebContents = (sender) => windows.find((w) => w.webContents.id === sender.id) || null;

    const electronMock = {
        app: Object.assign(new EventEmitter(), {
            name: 'mditor',
            isPackaged: false,
            requestSingleInstanceLock: () => true,
            exit: () => {},
            quit: () => {},
            isReady: () => true,
            whenReady: () => new Promise(() => {}),
            getPath: (name) => (name === 'userData' ? userDataDir : tmpDir),
            addRecentDocument: () => {}
        }),
        BrowserWindow: MockBrowserWindow,
        Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
        dialog: {
            showSaveDialog: async (_win, opts) => saveDialogHandler(opts),
            showOpenDialog: async () => ({ canceled: true, filePaths: [] })
        },
        ipcMain: {
            handle: (channel, fn) => ipcHandlers.set(channel, fn),
            on: (channel, fn) => ipcListeners.set(channel, fn)
        },
        shell: { openExternal: async () => {}, openPath: async () => '', showItemInFolder: () => {} },
        clipboard: { writeText: () => {} }
    };

    const customRequire = (id) => {
        if (id === 'electron') return electronMock;
        if (id.startsWith('./') || id.startsWith('../')) {
            return require(path.resolve(repoRoot, id));
        }
        return require(id);
    };

    const mainSandbox = {
        require: customRequire,
        __dirname: repoRoot,
        __filename: path.join(repoRoot, 'main.js'),
        process: {
            ...process,
            argv: ['electron', 'main.js'],
            cwd: () => tmpDir,
            execPath: process.execPath,
            platform: process.platform
        },
        console,
        Buffer,
        setTimeout,
        clearTimeout,
        Date
    };

    const mainExports = vm.runInNewContext(
        `${readRepoFile('main.js')}\n({ createWindow, windowStates })`,
        mainSandbox
    );

    const win = mainExports.createWindow(null);
    const senderEvent = { sender: win.webContents };

    const invokeIpc = async (channel, payload) => {
        ipcCallLog.push({ channel, payload });
        if (channel === 'save-file' && failNextSaveError) {
            const err = failNextSaveError;
            failNextSaveError = null;
            return { success: false, error: err };
        }
        const handler = ipcHandlers.get(channel);
        assert.ok(handler, `Missing IPC handler: ${channel}`);
        return handler(senderEvent, payload);
    };

    // 可控定时器队列（用于精确验证 2000ms 自动保存定时器行为）
    let nextTimerId = 1;
    const pendingTimers = new Map();
    const fakeSetTimeout = (fn, delay) => {
        const id = nextTimerId++;
        pendingTimers.set(id, { id, fn, delay });
        return id;
    };
    const fakeClearTimeout = (id) => {
        pendingTimers.delete(id);
    };

    // 构建渲染进程 DOM 与全局依赖
    const elementsById = new Map();
    const registerEl = (id, tag = 'div') => {
        const el = new FakeElement(tag);
        el.id = id;
        elementsById.set(id, el);
        return el;
    };

    const contentEl = registerEl('content', 'main');
    const editorEl = registerEl('editor', 'div');
    editorEl.style.display = 'none';
    const filetreeEl = registerEl('filetree', 'div');
    const fileNameEl = registerEl('file-name', 'span');
    fileNameEl.textContent = '未命名';
    const saveIndicatorEl = registerEl('save-indicator', 'span');
    const currentModeEl = registerEl('current-mode', 'span');
    const wordCountEl = registerEl('word-count', 'span');
    const quickOpenModal = registerEl('quick-open-modal', 'div');
    quickOpenModal.style.display = 'none';
    const quickOpenBackdrop = new FakeElement('div');
    quickOpenBackdrop.className = 'quick-open-backdrop';
    quickOpenModal.appendChild(quickOpenBackdrop);
    const quickOpenInput = registerEl('quick-open-input', 'input');
    const quickOpenList = registerEl('quick-open-list', 'div');

    // 构造与 index.html 一致的 #unsaved-content-dialog
    const unsavedDialog = registerEl('unsaved-content-dialog', 'div');
    unsavedDialog.style.display = 'none';
    unsavedDialog.innerHTML = `
        <div class="dialog-overlay"></div>
        <div class="dialog-content">
            <h3 class="dialog-title">是否保存当前修改？</h3>
            <p class="dialog-message">文档有尚未保存的更改，关闭前是否先保存？</p>
            <div class="dialog-actions">
                <button class="dialog-btn" data-action="discard">不保存</button>
                <button class="dialog-btn" data-action="cancel">取消</button>
                <button class="dialog-btn primary" data-action="save">保存</button>
            </div>
        </div>
    `;

    const bodyEl = new FakeElement('body');
    const docRootEl = new FakeElement('html');
    const storageMap = new Map();
    const localStorageMock = {
        getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
        setItem: (k, v) => storageMap.set(k, String(v)),
        removeItem: (k) => storageMap.delete(k)
    };

    const documentMock = {
        documentElement: docRootEl,
        body: bodyEl,
        getElementById: (id) => elementsById.get(id) || null,
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement: (tag) => new FakeElement(tag),
        addEventListener: () => {},
        removeEventListener: () => {}
    };

    const electronAPI = {
        platform: process.platform,
        saveFile: (content, forceDialog) => invokeIpc('save-file', { content, forceDialog }),
        readFile: (filePath) => invokeIpc('read-file', filePath),
        setCurrentFile: (filePath) => invokeIpc('set-current-file', filePath),
        readDirectory: (dirPath) => invokeIpc('read-directory', dirPath),
        getCurrentDirectory: () => invokeIpc('get-current-directory'),
        getParentDirectory: (dirPath) => invokeIpc('get-parent-directory', dirPath),
        listMarkdownFiles: (rootDir) => invokeIpc('list-markdown-files', rootDir),
        statPath: (targetPath) => invokeIpc('stat-path', targetPath)
    };

    const fileTypes = require(path.join(repoRoot, 'js/core/fileTypes.js'));
    const rendererSandbox = {
        window: {
            electronAPI,
            MditorEditor: FakeMditorEditor,
            MditorFileTypes: fileTypes,
            matchMedia: () => ({ matches: false }),
            getSelection: () => null,
            addEventListener: () => {}
        },
        document: documentMock,
        navigator: { platform: 'MacIntel' },
        localStorage: localStorageMock,
        requestAnimationFrame: (cb) => cb(),
        setTimeout: fakeSetTimeout,
        clearTimeout: fakeClearTimeout,
        console
    };
    rendererSandbox.window.window = rendererSandbox.window;

    vm.runInNewContext(readRepoFile('js/core/eventBus.js'), rendererSandbox);
    vm.runInNewContext(readRepoFile('js/core/state.js'), rendererSandbox);
    const app = vm.runInNewContext(
        `${readRepoFile('js/app.js')}\n(() => {
            class StubParser {
                setBasePath() {}
                parse(content) { return String(content || ''); }
                extractOutline() { return []; }
                classifyDocument(name = '') {
                    return { kind: String(name).endsWith('.js') ? 'code' : 'markdown', label: 'Markdown' };
                }
            }
            class StubRenderer {
                init() {}
                clear() {}
                getScrollPercentage() { return 0; }
                setScrollPercentage() {}
                scrollToHeading() {}
            }
            class StubOutline {
                init() {}
                clear() {}
            }
            class StubFileHandler {
                init() {}
            }
            globalThis.MarkdownParser = StubParser;
            globalThis.Renderer = StubRenderer;
            globalThis.Outline = StubOutline;
            globalThis.FileHandler = StubFileHandler;
            const instance = new App();
            instance._cacheElements();
            instance._initQuickOpen();
            return instance;
        })()`,
        rendererSandbox
    );

    t.after(() => {
        win.destroy();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    const getMainFilePath = () => mainExports.windowStates.get(win.webContents.id)?.filePath ?? null;

    const loadInitialExistingFile = async (filePath) => {
        const res = await electronAPI.readFile(filePath);
        assert.equal(res.error, undefined);
        app.currentFilePath = res.filePath;
        app._onFileLoaded(res.content, res.fileName);
        await app._loadFileTree(path.dirname(filePath));
    };

    const rawShowUnsavedDialog = app._showUnsavedContentDialog.bind(app);
    const setNextUnsavedDialogAction = (action) => {
        app._showUnsavedContentDialog = async (msg) => {
            const promise = rawShowUnsavedDialog(msg);
            assert.equal(unsavedDialog.style.display, 'flex', '未保存确认框应当展示');
            const btn = unsavedDialog.querySelector(`[data-action="${action}"]`);
            assert.ok(btn, `应存在动作按钮: ${action}`);
            await btn.dispatch('click');
            return promise;
        };
    };

    const triggerOpenVia = async (entry, targetPath, useEnterKey = false) => {
        if (entry === 'filetree') {
            await app._loadFileTree(path.dirname(targetPath));
            const targetName = path.basename(targetPath);
            const items = filetreeEl.querySelectorAll('.filetree-item');
            const matched = items.find((el) => el.querySelector('.filetree-name')?.textContent === targetName);
            assert.ok(matched, `文件树中应找到目标项: ${targetName}`);
            const clickable = matched.querySelector('.filetree-item-content');
            await clickable.dispatch('click', { noBubble: true });
        } else if (entry === 'quickopen') {
            app.filetreeRoot = path.dirname(targetPath);
            await app._openQuickOpen();
            assert.equal(app.quickOpenVisible, true);
            const targetName = path.basename(targetPath);
            app._filterQuickOpen(targetName);
            if (useEnterKey) {
                await quickOpenInput.dispatch('keydown', { key: 'Enter' });
            } else {
                const itemEl = quickOpenList.querySelector('.quick-open-item');
                assert.ok(itemEl, `快速打开列表中应找到目标项: ${targetName}`);
                await itemEl.dispatch('click', { noBubble: true });
            }
        } else {
            throw new Error(`Unknown entry: ${entry}`);
        }
    };

    const flushAutoSaveTimers = async () => {
        for (const [id, timer] of [...pendingTimers.entries()]) {
            if (timer.delay >= 2000) {
                pendingTimers.delete(id);
                await timer.fn();
            }
        }
    };

    return {
        tmpDir,
        app,
        electronAPI,
        ipcCallLog,
        pendingTimers,
        unsavedDialog,
        getMainFilePath,
        loadInitialExistingFile,
        setNextUnsavedDialogAction,
        triggerOpenVia,
        flushAutoSaveTimers,
        setSaveDialogHandler: (fn) => { saveDialogHandler = fn; },
        setFailNextSaveError: (msg) => { failNextSaveError = msg; }
    };
}

test('阅读模式保存：编辑过 A 后打开非空 B，阅读模式直接保存 B 必须写回 B 的正文而非隐藏编辑器中 A 的正文', async (t) => {
    const h = createTestHarness(t);
    const fileA = path.join(h.tmpDir, 'a.md');
    const fileB = path.join(h.tmpDir, 'b.md');
    const fileBCopy = path.join(h.tmpDir, 'b-copy.md');
    fs.writeFileSync(fileA, '# 文档 A\n原始 A', 'utf8');
    fs.writeFileSync(fileB, '# 文档 B\n这是 B 的非空正文', 'utf8');

    // 1. 打开 A 并切到编辑模式修改、保存 A
    await h.loadInitialExistingFile(fileA);
    h.app._setMode('edit');
    assert.equal(h.app.isEditMode, true);
    h.app.editor.userEdit('# 文档 A\n编辑后的 A 正文');
    assert.equal(await h.app._saveFile(false), true);
    assert.equal(fs.readFileSync(fileA, 'utf8'), '# 文档 A\n编辑后的 A 正文');

    // 2. 通过文件树打开非空文档 B，自动切回阅读模式，但隐藏编辑器仍残留 A 的正文
    await h.triggerOpenVia('filetree', fileB);
    assert.equal(h.app.isEditMode, false);
    assert.equal(h.app.currentFilePath, fileB);
    assert.equal(h.getMainFilePath(), fileB);
    assert.equal(h.app.editor.getValue(), '# 文档 A\n编辑后的 A 正文');
    assert.equal(h.app.currentContent, '# 文档 B\n这是 B 的非空正文');

    // 3. 在阅读模式直接保存 B（及另存为 B 副本），磁盘必须保持 B 的当前正文
    assert.equal(await h.app._saveFile(false), true);
    assert.equal(fs.readFileSync(fileB, 'utf8'), '# 文档 B\n这是 B 的非空正文');

    h.setSaveDialogHandler(async () => ({ canceled: false, filePath: fileBCopy }));
    assert.equal(await h.app._saveFile(true), true);
    assert.equal(fs.readFileSync(fileBCopy, 'utf8'), '# 文档 B\n这是 B 的非空正文');
});

test('保存等待期间出现新编辑时，旧保存成功不得清除未保存标记或继续打开目标文件', async (t) => {
    const h = createTestHarness(t);
    const fileA = path.join(h.tmpDir, 'a.md');
    const fileB = path.join(h.tmpDir, 'b.md');
    const savedDraft = path.join(h.tmpDir, 'draft.md');
    fs.writeFileSync(fileB, 'B 目标内容', 'utf8');
    h.app._newFile();
    h.app.editor.userEdit('草稿 V1');
    h.setNextUnsavedDialogAction('save');
    h.setSaveDialogHandler(async () => {
        h.app.editor.userEdit('草稿 V2');
        return { canceled: false, filePath: savedDraft };
    });

    await h.triggerOpenVia('quickopen', fileB);

    assert.equal(h.ipcCallLog.some((c) => c.channel === 'read-file'), false);
    assert.equal(h.app.currentFilePath, savedDraft);
    assert.equal(h.getMainFilePath(), savedDraft);
    assert.equal(h.app.currentContent, '草稿 V2');
    assert.equal(h.app.hasUnsavedChanges, true);
    assert.equal(fs.readFileSync(savedDraft, 'utf8'), '草稿 V1');
});

for (const entry of ['filetree', 'quickopen']) {
    const entryLabel = entry === 'filetree' ? '文件树点击' : '快速打开';

    test(`${entryLabel}：已有文件存在未保存修改时，保存成功继续打开目标文件；明确丢弃继续打开且保留原磁盘内容`, async (t) => {
        const h = createTestHarness(t);
        const fileA = path.join(h.tmpDir, 'a.md');
        const fileB = path.join(h.tmpDir, 'b.md');
        fs.writeFileSync(fileA, 'A 初始落盘', 'utf8');
        fs.writeFileSync(fileB, 'B 目标内容', 'utf8');

        // 分支 1：选择「保存」且保存成功 -> A 写入新内容，随后读取并切换到 B
        await h.loadInitialExistingFile(fileA);
        h.app._setMode('edit');
        h.app.editor.userEdit('A 已修改待保存');
        h.ipcCallLog.length = 0;
        h.setNextUnsavedDialogAction('save');

        await h.triggerOpenVia(entry, fileB);

        const channelsAfterSave = h.ipcCallLog.map((c) => c.channel);
        const saveIdx = channelsAfterSave.indexOf('save-file');
        const readIdx = channelsAfterSave.indexOf('read-file');
        assert.ok(saveIdx !== -1 && readIdx > saveIdx, '必须先完成 save-file 再调用 read-file');
        assert.equal(fs.readFileSync(fileA, 'utf8'), 'A 已修改待保存');
        assert.equal(fs.readFileSync(fileB, 'utf8'), 'B 目标内容');
        assert.equal(h.getMainFilePath(), fileB);
        assert.equal(h.app.currentFilePath, fileB);
        assert.equal(h.app.currentContent, 'B 目标内容');
        assert.equal(h.app.hasUnsavedChanges, false);

        // 分支 2：编辑 B 后切回 A 时选择「不保存」(discard) -> B 磁盘保持不变，成功切换到 A
        h.app._setMode('edit');
        h.app.editor.userEdit('B 未保存改动（将被丢弃）');
        h.ipcCallLog.length = 0;
        h.setNextUnsavedDialogAction('discard');

        await h.triggerOpenVia(entry, fileA);

        assert.equal(h.ipcCallLog.some((c) => c.channel === 'save-file'), false);
        assert.equal(fs.readFileSync(fileB, 'utf8'), 'B 目标内容');
        assert.equal(h.getMainFilePath(), fileA);
        assert.equal(h.app.currentFilePath, fileA);
        assert.equal(h.app.currentContent, 'A 已修改待保存');
        assert.equal(h.app.hasUnsavedChanges, false);
    });

    test(`${entryLabel}：已有文件存在未保存修改时，取消或保存失败不读取目标文件、不改变主进程/渲染器路径、不清除原正文`, async (t) => {
        const h = createTestHarness(t);
        const fileA = path.join(h.tmpDir, 'a.md');
        const fileB = path.join(h.tmpDir, 'b.md');
        fs.writeFileSync(fileA, 'A 原始磁盘内容', 'utf8');
        fs.writeFileSync(fileB, 'B 内容', 'utf8');

        await h.loadInitialExistingFile(fileA);
        h.app._setMode('edit');
        h.app.editor.userEdit('A 正在编辑的重要内容');

        // 分支 1：用户在确认框点击「取消」
        h.ipcCallLog.length = 0;
        h.setNextUnsavedDialogAction('cancel');
        await h.triggerOpenVia(entry, fileB, entry === 'quickopen');

        assert.equal(h.ipcCallLog.some((c) => c.channel === 'read-file'), false, '取消时严禁调用 read-file IPC');
        assert.equal(h.getMainFilePath(), fileA, '主进程当前路径不得改变');
        assert.equal(h.app.currentFilePath, fileA, '渲染器当前路径不得改变');
        assert.equal(h.app._getCurrentContent(), 'A 正在编辑的重要内容', '原正文不得清除');
        assert.equal(h.app.editor.getValue(), 'A 正在编辑的重要内容');
        assert.equal(h.app.hasUnsavedChanges, true);

        // 分支 2：用户点击「保存」，但保存失败
        h.ipcCallLog.length = 0;
        h.setFailNextSaveError('EACCES: permission denied');
        h.setNextUnsavedDialogAction('save');
        await h.triggerOpenVia(entry, fileB);

        assert.equal(h.ipcCallLog.some((c) => c.channel === 'save-file'), true);
        assert.equal(h.ipcCallLog.some((c) => c.channel === 'read-file'), false, '保存失败时严禁调用 read-file IPC');
        assert.equal(h.getMainFilePath(), fileA, '主进程当前路径不得改变');
        assert.equal(h.app.currentFilePath, fileA, '渲染器当前路径不得改变');
        assert.equal(h.app._getCurrentContent(), 'A 正在编辑的重要内容', '原正文不得清除');
        assert.equal(h.app.hasUnsavedChanges, true);
    });

    test(`${entryLabel}：无路径草稿存在未保存修改时，覆盖保存成功、明确丢弃、取消与保存失败/另存为取消`, async (t) => {
        const h = createTestHarness(t);
        const fileB = path.join(h.tmpDir, 'b.md');
        const savedDraftPath = path.join(h.tmpDir, 'saved-draft.md');
        fs.writeFileSync(fileB, '# 目标文件 B', 'utf8');

        // 先挂载工作区目录再新建无路径草稿
        h.app.filetreeRoot = h.tmpDir;
        await h.app._loadFileTree(h.tmpDir);
        h.app._newFile();
        assert.equal(h.app.currentFilePath, null);
        assert.equal(h.getMainFilePath(), null);

        h.app.editor.userEdit('# 未命名草稿正文');
        assert.equal(h.app.hasUnsavedChanges, true);

        // 1) 点击「取消」 -> 不读 B，主进程/渲染器路径保持 null，草稿正文保留
        h.ipcCallLog.length = 0;
        h.setNextUnsavedDialogAction('cancel');
        await h.triggerOpenVia(entry, fileB);

        assert.equal(h.ipcCallLog.some((c) => c.channel === 'read-file'), false);
        assert.equal(h.getMainFilePath(), null);
        assert.equal(h.app.currentFilePath, null);
        assert.equal(h.app._getCurrentContent(), '# 未命名草稿正文');
        assert.equal(h.app.hasUnsavedChanges, true);

        // 2) 点击「保存」但另存为对话框取消 -> 不读 B，路径仍为 null，草稿正文保留
        h.ipcCallLog.length = 0;
        h.setSaveDialogHandler(async () => ({ canceled: true }));
        h.setNextUnsavedDialogAction('save');
        await h.triggerOpenVia(entry, fileB);

        assert.equal(h.ipcCallLog.some((c) => c.channel === 'read-file'), false);
        assert.equal(h.getMainFilePath(), null);
        assert.equal(h.app.currentFilePath, null);
        assert.equal(h.app._getCurrentContent(), '# 未命名草稿正文');
        assert.equal(h.app.hasUnsavedChanges, true);

        // 3) 点击「保存」但磁盘写入失败 -> 不读 B，路径仍为 null，草稿正文保留
        const unwritablePath = path.join(h.tmpDir, 'nonexistent-subdir', 'draft.md');
        h.ipcCallLog.length = 0;
        h.setSaveDialogHandler(async () => ({ canceled: false, filePath: unwritablePath }));
        h.setNextUnsavedDialogAction('save');
        await h.triggerOpenVia(entry, fileB);

        assert.equal(h.ipcCallLog.some((c) => c.channel === 'read-file'), false);
        assert.equal(h.getMainFilePath(), null);
        assert.equal(h.app.currentFilePath, null);
        assert.equal(h.app._getCurrentContent(), '# 未命名草稿正文');
        assert.equal(h.app.hasUnsavedChanges, true);

        // 4) 点击「保存」且另存为成功 -> 草稿成功落盘，继续打开 B
        h.ipcCallLog.length = 0;
        h.setSaveDialogHandler(async () => ({ canceled: false, filePath: savedDraftPath }));
        h.setNextUnsavedDialogAction('save');
        await h.triggerOpenVia(entry, fileB);

        assert.equal(fs.readFileSync(savedDraftPath, 'utf8'), '# 未命名草稿正文');
        assert.equal(h.getMainFilePath(), fileB);
        assert.equal(h.app.currentFilePath, fileB);
        assert.equal(h.app.currentContent, '# 目标文件 B');
        assert.equal(h.app.hasUnsavedChanges, false);

        // 5) 再次新建无路径草稿并输入内容，选择「不保存」(discard) -> 不弹另存为，直接打开 B
        h.app._newFile();
        h.app.editor.userEdit('第二份临时草稿');
        h.ipcCallLog.length = 0;
        h.setNextUnsavedDialogAction('discard');
        await h.triggerOpenVia(entry, fileB);

        assert.equal(h.ipcCallLog.some((c) => c.channel === 'save-file'), false);
        assert.equal(h.getMainFilePath(), fileB);
        assert.equal(h.app.currentFilePath, fileB);
        assert.equal(h.app.currentContent, '# 目标文件 B');
        assert.equal(h.app.hasUnsavedChanges, false);
    });

    test(`${entryLabel}：切换文件时待执行的旧自动保存定时器被清理，绝不将旧正文写到新文件`, async (t) => {
        const h = createTestHarness(t);
        const fileA = path.join(h.tmpDir, 'a.md');
        const fileB = path.join(h.tmpDir, 'b.md');
        fs.writeFileSync(fileA, 'A 初始内容', 'utf8');
        fs.writeFileSync(fileB, 'B 独立内容', 'utf8');

        // 1. 编辑 A 产生待执行的 2s 自动保存定时器
        await h.loadInitialExistingFile(fileA);
        h.app._setMode('edit');
        h.app.editor.userEdit('A 待自动保存的旧正文');
        assert.notEqual(h.app.autoSaveTimer, null, '编辑已有文件后应挂起自动保存定时器');

        // 2. 在 2s 到期前切换到 B 并选择丢弃修改
        h.setNextUnsavedDialogAction('discard');
        await h.triggerOpenVia(entry, fileB);

        assert.equal(h.app.autoSaveTimer, null, '切换后旧自动保存定时器必须被清除');

        // 3. 推进所有待执行定时器，且模拟过期回调重入，验证 B 与 A 均未被误写
        await h.flushAutoSaveTimers();
        await h.app._autoSave(fileA);

        assert.equal(fs.readFileSync(fileB, 'utf8'), 'B 独立内容', '旧自动保存绝不能覆写新打开的 B');
        assert.equal(fs.readFileSync(fileA, 'utf8'), 'A 初始内容', '已丢弃的旧修改不应被延迟自动保存写回 A');

        // 4. 无路径草稿编辑不应挂起自动保存定时器，打开 B 后推进定时器也不会写入 B
        h.app._newFile();
        h.app.editor.userEdit('无路径草稿内容');
        assert.equal(h.app.autoSaveTimer, null, '无路径草稿不应启动自动保存定时器');

        h.setNextUnsavedDialogAction('discard');
        await h.triggerOpenVia(entry, fileB);
        await h.flushAutoSaveTimers();

        assert.equal(fs.readFileSync(fileB, 'utf8'), 'B 独立内容');
    });
}
