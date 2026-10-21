import test from 'node:test';
import assert from 'node:assert/strict';

import { loadModule } from './helpers/load-module.mjs';

const { parseMarkdownBlocks, buildMarkdownPdf } = await loadModule('src/services/pdf.ts');

const withoutLayout = (blocks) => blocks.map(({ layout, ...rest }) => rest);
const visible = (blocks) => blocks.filter((block) => block.type !== 'spacer');

// 从生成的 PDF 中取出全部文字（内容流里的文字均为 UTF-16BE 十六进制串）
function extractTexts(bytes) {
    const source = new TextDecoder('latin1').decode(bytes);
    return [...source.matchAll(/<FEFF([0-9A-F]*)> Tj/g)].map(([, hex]) => {
        const units = hex.match(/.{4}/g) || [];
        return String.fromCharCode(...units.map((unit) => parseInt(unit, 16)));
    });
}

test('嵌套列表按层级缩进，有序列表延续序号，任务列表带勾选标记', () => {
    const blocks = visible(parseMarkdownBlocks('1. 一\n   - 嵌套\n     - 三层\n2. 二\n\n段落\n\n7. 七\n\n- [x] 完成\n- [ ] 待办'));
    const items = blocks.filter((block) => block.type === 'listItem');

    assert.deepEqual(items.map((item) => [item.marker, item.lines[0]]), [
        ['1.', '一'], ['•', '嵌套'], ['•', '三层'], ['2.', '二'], ['7.', '七'], ['• [x]', '完成'], ['• [ ]', '待办']
    ]);
    const [first, nested, third] = items;
    assert.ok(nested.layout.offset > first.layout.offset, '二级列表应比一级缩进');
    assert.ok(third.layout.offset > nested.layout.offset, '三级列表应比二级缩进');
});

test('列表项内的后续段落、代码块缩进到标记之后', () => {
    const blocks = visible(parseMarkdownBlocks('- 首行\n\n  第二段\n\n  ```\n  code\n  ```'));
    const [item, paragraph, code] = blocks;

    assert.equal(item.type, 'listItem');
    assert.deepEqual(withoutLayout([paragraph, code]), [
        { type: 'paragraph', lines: ['第二段'] },
        { type: 'code', lines: ['code'] }
    ]);
    assert.ok(paragraph.layout.offset > item.layout.offset);
    assert.equal(code.layout.offset, paragraph.layout.offset);
});

test('Setext 标题、缩进代码块与分隔线', () => {
    const blocks = visible(parseMarkdownBlocks('主标题\n===\n\n副标题\n---\n\n    缩进代码\n\n***'));

    assert.deepEqual(withoutLayout(blocks), [
        { type: 'heading', level: 1, text: '主标题' },
        { type: 'heading', level: 2, text: '副标题' },
        { type: 'code', lines: ['缩进代码'] },
        { type: 'hr' }
    ]);
});

test('嵌套引用逐层增加引用竖线，引用内可包含列表', () => {
    const blocks = visible(parseMarkdownBlocks('> 外层\n> > 内层\n> - 列表项'));
    const [outer, inner, item] = blocks;

    assert.equal(outer.layout.quoteBars.length, 1);
    assert.equal(inner.layout.quoteBars.length, 2);
    assert.equal(item.type, 'listItem');
    assert.equal(item.layout.quoteBars.length, 1);
    assert.ok(inner.layout.offset > outer.layout.offset);
});

test('表格保留列对齐方式，单元格内的行内语法转为纯文本', () => {
    const [table] = visible(parseMarkdownBlocks('| 左 | 中 | 右 |\n|:---|:--:|---:|\n| **a** | `b` | [c](https://c.example) |'));

    assert.equal(table.type, 'table');
    assert.deepEqual(table.header, ['左', '中', '右']);
    assert.deepEqual(table.rows, [['a', 'b', 'c (https://c.example)']]);
    assert.deepEqual(table.align, ['left', 'center', 'right']);
});

test('行内语法转纯文本：链接附地址、自动链接只显示一次、实体只解码一次', () => {
    const [paragraph] = visible(parseMarkdownBlocks(
        '**粗** *斜* ~~删~~ ==亮== `a < b && c` [q](https://a.example/?x=1&y=2) <https://auto.example> www.github.com [r][1] \\*转义\\* &amp; &lt;\n\n[1]: https://ref.example'
    ));

    assert.deepEqual(paragraph.lines, [
        '粗 斜 删 亮 a < b && c q (https://a.example/?x=1&y=2) https://auto.example www.github.com r (https://ref.example) *转义* & <'
    ]);
});

test('单个换行保留为独立行（与网页预览的 breaks 一致）', () => {
    const [paragraph] = visible(parseMarkdownBlocks('第一行\n第二行'));

    assert.deepEqual(paragraph.lines, ['第一行', '第二行']);
});

test('公式原样保留，内部的 _ * 不被当作强调；普通 $ 不受影响', () => {
    const blocks = visible(parseMarkdownBlocks('行内 $a_b * c_d$ 与 \\(x_1\\)，价格 $5 与 $10\n\n$$\n\\sum_{i=1}^n x_i\n$$'));

    assert.deepEqual(withoutLayout(blocks), [
        { type: 'paragraph', lines: ['行内 $a_b * c_d$ 与 \\(x_1\\)，价格 $5 与 $10'] },
        { type: 'code', lines: ['$$', '\\sum_{i=1}^n x_i', '$$'] }
    ]);
});

test('[TOC] 包含所有标题（含 Setext 与引用、列表中的标题）', () => {
    const blocks = visible(parseMarkdownBlocks('[TOC]\n\n总览\n---\n\n## 第二节 `code`\n\n> ### 引用内标题'));

    assert.deepEqual(blocks[0], {
        type: 'toc',
        items: [
            { level: 2, text: '总览' },
            { level: 2, text: '第二节 code' },
            { level: 3, text: '引用内标题' }
        ]
    });
});

test('原始 HTML 只保留文字，链接定义不产生内容', () => {
    const blocks = visible(parseMarkdownBlocks('<details><summary>摘要</summary>内容 &amp; 更多</details>\n\n行内 <b>粗</b> 文字\n\n[1]: https://ref.example'));

    assert.deepEqual(withoutLayout(blocks), [
        { type: 'paragraph', lines: ['摘要内容 & 更多'] },
        { type: 'paragraph', lines: ['行内 粗 文字'] }
    ]);
});

test('图片输出为「[图片] 说明 (地址)」', () => {
    const [paragraph] = visible(parseMarkdownBlocks('![示意图](https://img.example/a.png "标题") ![](https://img.example/b.png)'));

    assert.deepEqual(paragraph.lines, ['[图片] 示意图 (https://img.example/a.png) [图片] https://img.example/b.png']);
});

test('生成的 PDF 结构有效：xref 偏移指向对应对象，字体声明 ASCII 半角宽度', () => {
    const bytes = buildMarkdownPdf('# 标题\n\n正文 text');
    const source = new TextDecoder('latin1').decode(bytes);

    assert.ok(source.startsWith('%PDF-1.4\n'));
    assert.ok(source.endsWith('%%EOF'));
    assert.match(source, /\/W \[1 95 500\]/);

    const xrefPos = Number(source.match(/startxref\n(\d+)\n%%EOF$/)[1]);
    assert.ok(source.startsWith('xref', xrefPos), 'startxref 应指向 xref 表');

    const entries = source.slice(xrefPos).split('\n').slice(3).filter((line) => / 00000 n $/.test(line));
    entries.forEach((entry, index) => {
        const offset = Number(entry.slice(0, 10));
        assert.ok(source.startsWith(`${index + 1} 0 obj`, offset), `对象 ${index + 1} 的偏移应正确`);
    });
});

test('PDF 中包含各类块的文字，嵌套结构不丢内容', () => {
    const texts = extractTexts(buildMarkdownPdf(
        '# 标题\n\n[TOC]\n\n1. 一\n   - 嵌套\n\n> 引用\n> > 内层\n\n| 列 | 值 |\n|---|--:|\n| a | 1 |\n\n```js\nconst x = 1;\n```\n\n- [x] 完成'
    ));

    for (const expected of ['标题', '目录', '1.', '一', '嵌套', '引用', '内层', '列', '值', 'a', '1', 'const x = 1;', '• [x]', '完成']) {
        assert.ok(texts.includes(expected), `PDF 应包含「${expected}」，实际：${JSON.stringify(texts)}`);
    }
});

test('长内容自动分页，表格跨页时重复表头', () => {
    const rows = Array.from({ length: 80 }, (_, i) => `| 行${i} | 值${i} |`).join('\n');
    const bytes = buildMarkdownPdf(`| 名称 | 数值 |\n|---|---|\n${rows}`);
    const source = new TextDecoder('latin1').decode(bytes);
    const pageCount = Number(source.match(/\/Count (\d+)/)[1]);
    const texts = extractTexts(bytes);

    assert.ok(pageCount >= 2, '应分为多页');
    assert.equal(texts.filter((text) => text === '名称').length, pageCount, '每页都应重复表头');
    assert.ok(texts.includes('行79'));
});

test('空内容仍生成一页有效 PDF', () => {
    const source = new TextDecoder('latin1').decode(buildMarkdownPdf(''));

    assert.match(source, /\/Count 1/);
    assert.ok(source.endsWith('%%EOF'));
});
