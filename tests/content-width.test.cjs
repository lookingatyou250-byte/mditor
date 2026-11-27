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
