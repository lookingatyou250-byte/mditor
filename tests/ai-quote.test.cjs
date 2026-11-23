const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function createApp(api = {}) {
    const sandbox = { window: { electronAPI: api }, document: { addEventListener() {} } };
    const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
    const app = vm.runInNewContext(`${source}\nObject.create(App.prototype)`, sandbox);
    app.elements = { fileName: { textContent: '未命名' } };
    app.stagedQuotesByFile = new Map();
    app.parser = { classifyDocument: name => ({ label: name.endsWith('.js') ? 'JavaScript' : 'Markdown' }) };
    app._showToast = () => {};
    app._renderStagedQuotesUI = () => {};
    return app;
}

const saved = { id: '1', fileName: '笔记.md', filePath: 'D:\\项目 A\\笔记.md', quote: '原文', location: '章节一', note: '请修改这段' };

test('adds disk metadata to both DSH and clipboard, and stats same path only once per send', async () => {
    const calls = [];
    let payload, copied;
    const app = createApp({
        statPath: async filePath => {
            calls.push(filePath);
            return { isFile: true, size: 0, modifiedAt: '2026-11-23T00:00:00.000Z' };
        },
        sendToDsh: async value => { payload = value; return { success: true }; },
        copyText: async text => { copied = text; return { success: true }; }
    });
    app._getActiveAiProvider = () => ({ id: 'dsh' });
    app._getSendTargetDisplayName = () => 'DSH';
    const items = [saved, { ...saved, id: '2', note: '' }];
    assert.equal(await app._dispatchQuotesToAi(items), true);
    app._getActiveAiProvider = () => null;
    assert.equal(await app._dispatchQuotesToAi(items), true);
    assert.equal(copied, payload.prompt);
    assert.equal(payload.filePath, saved.filePath);
    assert.deepEqual(calls, [saved.filePath, saved.filePath]);
    assert.equal(payload.prompt.split(saved.filePath).length, 2);
    assert.match(payload.prompt, /文件："笔记.md"\n类型：Markdown/);
    assert.match(payload.prompt, /磁盘大小：0 B\n磁盘修改时间：2026-11-23T00:00:00.000Z/);
    assert.match(payload.prompt, /2\. 章节一\n> 原文/);
});

test('pathless draft does not borrow another file path; metadata lookup failure keeps path', async () => {
    let payload;
    const app = createApp({
        statPath: async () => { throw new Error('missing file'); },
        sendToDsh: async value => { payload = value; return { success: true }; }
    });
    app.currentFilePath = saved.filePath;
    app._getActiveAiProvider = () => ({ id: 'dsh' });
    app._getSendTargetDisplayName = () => 'DSH';
    const draft = { fileName: '未命名', quote: '草稿' };
    await app._dispatchQuotesToAi([draft]);
    assert.equal(payload.filePath, null);
    assert.doesNotMatch(payload.prompt, /路径：|磁盘大小/);
    await app._dispatchQuotesToAi([saved, draft]);
    assert.ok(payload.prompt.includes(saved.filePath));
    assert.doesNotMatch(payload.prompt, /磁盘大小/);
    assert.match(payload.prompt, /2\. 文件 2\n> 草稿/);
});

test('staged drafts follow first save without affecting later drafts', () => {
    const app = createApp({ platform: 'win32' });
    const before = app._getCurrentDocKey();
    app._setCurrentStagedQuotes([{ id: 'draft', quote: '草稿', fileName: '未命名' }]);
    app._pendingQuoteContext = { quote: '第二段' };
    app.currentFilePath = saved.filePath;
    app._moveQuoteFileContext(before, saved.fileName);
    assert.equal(app.stagedQuotesByFile.has(before), false);
    assert.equal(app._getCurrentStagedQuotes()[0].filePath, saved.filePath);
    assert.equal(app._pendingQuoteContext.fileName, saved.fileName);
});
