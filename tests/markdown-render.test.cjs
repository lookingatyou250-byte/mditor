const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function createParser() {
    const markedPath = path.join(__dirname, '..', 'lib', 'marked.min.js');
    const markedSource = fs.readFileSync(markedPath, 'utf8');
    const sandbox = { window: {}, DOMPurify: undefined, console };
    vm.runInNewContext(markedSource, sandbox);
    return vm.runInNewContext(
        `${read('js/modules/parser.js')}\nnew MarkdownParser({ emit() {}, on() {} }, { get() {} })`,
        sandbox
    );
}

test('parses CJK punctuation-adjacent bold spans cleanly without corrupting code or math', () => {
    const parser = createParser();

    const quoteBold = parser.parse('整个体系遵循**「商拓侧（Erwin 私域）与办案侧（团队交付）物理隔离」**的最高架构铁律：');
    assert.match(quoteBold, /遵循<strong>「商拓侧（Erwin 私域）与办案侧（团队交付）物理隔离」<\/strong>的最高架构铁律：/);

    const multiQuote = parser.parse('测试**“中文引号加粗”**效果和**（括号加粗）**效果');
    assert.match(multiQuote, /测试<strong>“中文引号加粗”<\/strong>效果和<strong>（括号加粗）<\/strong>效果/);

    const rightPunct = parser.parse('前缀**普通加粗（带括号）**后缀');
    assert.match(rightPunct, /前缀<strong>普通加粗（带括号）<\/strong>后缀/);

    const leftPunct = parser.parse('前缀**（括号开头）普通结尾**后缀');
    assert.match(leftPunct, /前缀<strong>（括号开头）普通结尾<\/strong>后缀/);

    const inlineCodeInBold = parser.parse('内部含代码**「运行 `npm **test**` 命令」**后继续');
    assert.match(inlineCodeInBold, /<strong>「运行 <code>npm \*\*test\*\*<\/code> 命令」<\/strong>后继续/);

    const boldCode = parser.parse('使用**`SMDesk.exe`**工具');
    assert.match(boldCode, /使用<strong><code>SMDesk\.exe<\/code><\/strong>工具/);

    const nestedEm = parser.parse('嵌套**（括号）*斜体***结束');
    assert.match(nestedEm, /嵌套<strong>（括号）<em>斜体<\/em><\/strong>结束/);

    const codeBlock = parser.parse('```md\n遵循**「不该变粗」**测试\n```');
    assert.doesNotMatch(codeBlock, /<strong>/);
    assert.match(codeBlock, /遵循\*\*「不该变粗」\*\*测试/);

    const inlineCode = parser.parse('行内：`遵循**「不该变粗」**测试`');
    assert.doesNotMatch(inlineCode, /<strong>/);

    const mathOp = parser.parse('计算 2 ** 3 ** 4 保持原样');
    assert.doesNotMatch(mathOp, /<strong>/);

    const tripleStar = parser.parse('多个星号 ***「粗斜体」*** 测试');
    assert.match(tripleStar, /<em><strong>「粗斜体」<\/strong><\/em>|<strong><em>「粗斜体」<\/em><\/strong>/);
});

test('lightbox supports SVG stage, wheel zoom, drag pan, and double-click reset', () => {
    const html = read('index.html');
    assert.match(html, /id="image-lightbox-stage"/);
    assert.match(html, /id="image-lightbox-svg"/);

    const rendererSrc = read('js/modules/renderer.js');
    assert.match(rendererSrc, /_openSvgLightbox\(svgEl\)/);
    assert.doesNotMatch(rendererSrc, /按 Esc 或点击空白处关闭/);

    const appSrc = read('js/app.js');
    assert.match(appSrc, /lightbox\.addEventListener\('wheel'/);
    assert.match(appSrc, /stage\.addEventListener\('mousedown'/);
    assert.match(appSrc, /stage\.addEventListener\('dblclick'/);
});
