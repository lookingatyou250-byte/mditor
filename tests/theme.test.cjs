const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('picker has three day and three night themes and restores deep pine as a dark theme', () => {
    const html = read('index.html');
    const [, picker] = html.match(/id="theme-popover"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/);
    const themes = section => [...section.matchAll(/data-theme-id="([a-z]+)"/g)].map(match => match[1]);
    const [day, night] = picker.split('theme-popover-divider');
    assert.deepEqual(themes(day), ['light', 'paper', 'sage']);
    assert.deepEqual(themes(night), ['dark', 'midnight', 'pine']);
    const root = { dataset: {} };
    const link = {};
    vm.runInNewContext(read('js/core/initTheme.js'), {
        localStorage: { getItem: () => 'pine' },
        document: { documentElement: root, getElementById: () => link }
    });
    assert.equal(root.dataset.theme, 'pine');
    assert.equal(root.dataset.colorScheme, 'dark');
    assert.equal(link.href, 'lib/hljs-github-dark.min.css');
    assert.match(read('css/variables.css'), /body\[data-theme="pine"\] \{\s*--bg-body: #19231E;/);
    assert.match(read('main.js'), /pine: '#19231E'/);
});
