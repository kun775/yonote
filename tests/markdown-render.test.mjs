import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// 覆盖 function.js 中基于 marked 的 Markdown 渲染：CommonMark / GFM 语法、项目扩展与安全约束。
// DOMPurify 需要 DOM，无法在 Node 中运行；这里验证的是净化前的输出本身。

function loadRenderer({ withMarked = true } = {}) {
    const context = {
        window: { noteUpdatedAt: 0, noteKey: 'render-test', location: { pathname: '/', href: '/' }, innerHeight: 800 },
        navigator: { userAgent: 'node' },
        document: {
            getElementById: () => null,
            querySelector: () => null,
            querySelectorAll: () => [],
            body: { dataset: {} }
        },
        localStorage: { getItem: () => null, setItem() {} },
        setTimeout,
        clearTimeout,
        console
    };
    vm.createContext(context);
    if (withMarked) {
        vm.runInContext(fs.readFileSync('public/static/vendor/marked.umd.js', 'utf8'), context);
    }
    vm.runInContext(fs.readFileSync('public/static/function.js', 'utf8'), context);
    return context;
}

const { convertToHtml, sanitizeUrl } = loadRenderer();
const render = (markdown, options) => convertToHtml(markdown, options);

test('嵌套列表、有序列表起始序号与任务列表', () => {
    const html = render('1. 一\n   - 嵌套\n     - 三层\n2. 二\n\n段落\n\n3. 从三开始\n\n- [x] 完成\n- [ ] 待办');

    assert.match(html, /<ol>\s*<li>一<ul>\s*<li>嵌套<ul>\s*<li>三层<\/li>/);
    assert.match(html, /<ol start="3">/);
    assert.match(html, /<li class="task-list-item"><input checked="" disabled="" type="checkbox"> 完成<\/li>/);
    assert.match(html, /<li class="task-list-item"><input disabled="" type="checkbox"> 待办<\/li>/);
});

test('Setext 标题、嵌套引用与引用内的块级内容', () => {
    const html = render('主标题\n===\n\n> 外层\n> > 内层\n> - 列表项');

    assert.match(html, /<h1 id="主标题-0">主标题<\/h1>/);
    assert.match(html, /<blockquote>\s*<p>外层<\/p>\s*<blockquote>\s*<p>内层<\/p>\s*<\/blockquote>\s*<ul>\s*<li>列表项<\/li>/);
});

test('表格支持列对齐与单元格行内语法', () => {
    const html = render('| 左 | 中 | 右 |\n|:---|:--:|---:|\n| **a** | `b` | c |');

    assert.match(html, /<th align="left">左<\/th>/);
    assert.match(html, /<th align="center">中<\/th>/);
    assert.match(html, /<th align="right">右<\/th>/);
    assert.match(html, /<td align="left"><strong>a<\/strong><\/td>/);
    assert.match(html, /<td align="center"><code>b<\/code><\/td>/);
});

test('行内代码与链接中的特殊字符只转义一次', () => {
    const html = render('`a < b && c` ``含 ` 反引号`` [q](https://a.example/?x=1&y=2)');

    assert.match(html, /<code>a &lt; b &amp;&amp; c<\/code>/);
    assert.match(html, /<code>含 ` 反引号<\/code>/);
    assert.match(html, /href="https:\/\/a\.example\/\?x=1&amp;y=2"/);
    assert.doesNotMatch(html, /&amp;amp;|&amp;lt;/);
});

test('引用式链接、自动链接、链接标题、转义与删除线', () => {
    const html = render('[ref][1] <https://auto.example> www.github.com [t](https://t.example "标题") \\*非强调\\* ~~删除~~\n\n[1]: https://ref.example');

    assert.match(html, /<a href="https:\/\/ref\.example" target="_blank" rel="noopener noreferrer">ref<\/a>/);
    assert.match(html, /<a href="https:\/\/auto\.example"[^>]*>https:\/\/auto\.example<\/a>/);
    assert.match(html, /<a href="http:\/\/www\.github\.com"[^>]*>www\.github\.com<\/a>/);
    assert.match(html, /title="标题"/);
    assert.match(html, /\*非强调\*/);
    assert.match(html, /<del>删除<\/del>/);
});

test('相对链接同窗口打开，外链新窗口打开', () => {
    const html = render('[doc](docs/a.md) [锚点](#sec) [ext](https://e.example)');

    assert.match(html, /<a href="docs\/a\.md">doc<\/a>/);
    assert.match(html, /<a href="#sec">锚点<\/a>/);
    assert.match(html, /<a href="https:\/\/e\.example" target="_blank" rel="noopener noreferrer">ext<\/a>/);
});

test('缩进代码块与带语言的围栏代码块，mermaid 保留语言类名', () => {
    const html = render('    缩进 <code>\n\n```js\nconst x = 1 < 2;\n```\n\n```mermaid\ngraph TD; A-->B\n```');

    assert.match(html, /<pre><code>缩进 &lt;code&gt;\n<\/code><\/pre>/);
    assert.match(html, /<pre><code class="language-js">const x = 1 &lt; 2;\n<\/code><\/pre>/);
    assert.match(html, /<pre><code class="language-mermaid">graph TD; A--&gt;B\n<\/code><\/pre>/);
});

test('单个换行保留为 <br>（与既有笔记的显示方式一致）', () => {
    assert.match(render('第一行\n第二行'), /<p>第一行<br>第二行<\/p>/);
});

test('==高亮== 支持内部行内语法，单个等号不受影响', () => {
    const html = render('==**重点**== 以及 a == b');

    assert.match(html, /<mark><strong>重点<\/strong><\/mark>/);
    assert.match(html, /a == b/);
});

test('[TOC] 生成目录，锚点与标题 id 一致（含 Setext 与引用中的标题）', () => {
    const html = render('[TOC]\n\n总览\n---\n\n## 第二节\n\n> ### 引用内标题');

    assert.match(html, /<div class="toc-container">/);
    for (const id of ['总览-0', '第二节-1', '引用内标题-2']) {
        assert.match(html, new RegExp(`href="#${id}"`), `目录应包含 #${id}`);
        assert.match(html, new RegExp(`<h\\d id="${id}">`), `标题应带 id ${id}`);
    }
});

test('数学公式原样保留给 KaTeX，内部的 _ * \\ 不被当作 Markdown', () => {
    const html = render('行内 $a_b * c_d$ 与 \\(x_1\\)、\\[y_2\\]\n\n$$\n\\sum_{i=1}^n x_i\n$$');

    assert.match(html, /<span class="math-inline">\$a_b \* c_d\$<\/span>/);
    assert.match(html, /<span class="math-inline">\\\(x_1\\\)<\/span>/);
    assert.match(html, /<span class="math-inline">\\\[y_2\\\]<\/span>/);
    assert.match(html, /<div class="math-block">\$\$\n\\sum_\{i=1\}\^n x_i\n\$\$<\/div>/);
    assert.doesNotMatch(html, /<em>/);
});

test('金额等普通 $ 不被识别为公式，转义的 \\$ 输出为字面量', () => {
    const html = render('价格 $5 与 $10，\\$x\\$ 不是公式');

    assert.doesNotMatch(html, /math-inline/);
    assert.match(html, /价格 \$5 与 \$10，\$x\$ 不是公式/);
});

test('同一段落里相邻的块公式不会被合并成一个', () => {
    const html = render('$$x$$ y\n$$z$$');

    assert.match(html, /<span class="math-inline">\$\$x\$\$<\/span> y/);
    assert.match(html, /\$\$z\$\$/);
    assert.doesNotMatch(html, /\$\$x\$\$ y\n\$\$z\$\$<\/div>/);
});

test('未启用 allowHtml 时原始 HTML 一律转义', () => {
    const html = render('<img src=x onerror=alert(1)>\n\n行内 <b>粗</b>\n\n# <script>alert(1)</script>');

    assert.doesNotMatch(html, /<img src=x|<b>|<script>/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(html, /&lt;b&gt;粗&lt;\/b&gt;/);
});

test('启用 allowHtml 时保留原始 HTML，交由 DOMPurify 净化', () => {
    const html = render('<details><summary>摘要</summary>内容</details>', { allowHtml: true });

    assert.match(html, /<details><summary>摘要<\/summary>内容<\/details>/);
});

test('危险协议的链接与图片被移除，只保留文本', () => {
    const html = render('[a](javascript:alert(1)) [b](vbscript:x) [c](data:text/html,x) ![d](javascript:x) ![e](data:image/png;base64,AAA)', { allowHtml: true });

    assert.doesNotMatch(html, /javascript:|vbscript:|data:text/);
    assert.match(html, /<img src="data:image\/png;base64,AAA" alt="e"/);
});

test('sanitizeUrl 协议白名单', () => {
    assert.equal(sanitizeUrl('https://a.example/?x=1&y=2'), 'https://a.example/?x=1&amp;y=2');
    assert.equal(sanitizeUrl('docs/a.md'), 'docs/a.md');
    assert.equal(sanitizeUrl('mailto:a@b.c'), 'mailto:a@b.c');
    for (const value of ['javascript:alert(1)', 'JaVaScRiPt:x', 'java\tscript:x', ' \u0001javascript:x', 'data:text/html,x', 'vbscript:x']) {
        assert.equal(sanitizeUrl(value), '', `应拒绝 ${JSON.stringify(value)}`);
    }
    assert.equal(sanitizeUrl('data:image/png;base64,AAA'), '');
    assert.equal(sanitizeUrl('data:image/png;base64,AAA', true), 'data:image/png;base64,AAA');
});

test('marked 未加载时退化为转义后的纯文本', () => {
    const { convertToHtml: fallback } = loadRenderer({ withMarked: false });

    assert.equal(fallback('**a**\n<b>x</b>'), '**a**<br>&lt;b&gt;x&lt;/b&gt;');
});
