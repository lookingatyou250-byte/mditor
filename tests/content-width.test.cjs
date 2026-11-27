const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('content width supports narrow, medium, wide, and full modes', () => {
    const html = read('index.html');
    const match = html.match(/id="content-width-segment"[^>]*>([\s\S]*?)<\/div>/);
    assert.ok(match, 'content-width-segment should exist');
    const widths = [...match[1].matchAll(/data-width="([a-z]+)"/g)].map(m => m[1]);
    assert.deepEqual(widths, ['narrow', 'medium', 'wide', 'full']);

    const props = {};
    const sandbox = {
        window: {},
        document: {
            addEventListener() {},
            documentElement: {
                style: { setProperty(k, v) { props[k] = v; } }
            }
        }
    };
    const app = vm.runInNewContext(`${read('js/app.js')}\nObject.create(App.prototype)`, sandbox);
    app._updateTypographyUI = () => {};

    const expected = {
        narrow: '720px',
        medium: '880px',
        wide: '1120px',
        full: '100%'
    };
    for (const [mode, cssWidth] of Object.entries(expected)) {
        app.contentWidth = mode;
        app._applyContentWidth();
        assert.equal(props['--content-max-width'], cssWidth);
    }
});

test('markdown tables and CSV views stay aligned with --content-max-width and scroll when overflowing', () => {
    const marked = require(path.join(__dirname, '..', 'lib', 'marked.min.js'));
    const parserSandbox = {
        marked,
        window: {},
        DOMPurify: undefined,
        console
    };
    const parser = vm.runInNewContext(
        `${read('js/modules/parser.js')}\nnew MarkdownParser({ emit() {}, on() {} }, { get() {} })`,
        parserSandbox
    );

    const html = parser.parse('| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| A | B | C |');
    assert.match(html, /<div class="md-table-wrap"><table>/);
    assert.match(html, /<\/table><\/div>/);

    const css = read('css/markdown.css');
    assert.doesNotMatch(css, /\.content-area > \.md-table-wrap/);
    assert.match(css, /\.md-table-wrap\s*\{[\s\S]*overflow-x:\s*auto;/);
    assert.match(css, /\.content-area > \.doc-code-view,\s*\.content-area > \.doc-plain-view,\s*\.content-area > \.doc-table-view\s*\{\s*max-width:\s*min\(var\(--content-max-width\),\s*100%\);/);
});
