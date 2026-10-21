import { Marked, type Token, type TokenizerExtension, type Tokens } from 'marked';

const PDF_PAGE_WIDTH = 595;
const PDF_PAGE_HEIGHT = 842;
const PDF_MARGIN_X = 44;
const PDF_MARGIN_TOP = 52;
const PDF_MARGIN_BOTTOM = 48;
const PDF_CONTENT_WIDTH = PDF_PAGE_WIDTH - PDF_MARGIN_X * 2;

// 列表内容相对列表标记的缩进、每层引用的缩进（pt）
const LIST_MARKER_MIN_WIDTH = 18;
const QUOTE_INDENT = 12;
const QUOTE_BAR_WIDTH = 2;

type Rgb = [number, number, number];

type Align = 'left' | 'center' | 'right' | null;

interface HeadingItem {
    level: number;
    text: string;
}

// 块在页面上的位置：offset 为相对左边距的缩进，quoteBars 为各层引用竖线的 x 偏移
interface Layout {
    offset: number;
    quoteBars: number[];
}

export type Block =
    | { type: 'heading'; level: number; text: string; layout: Layout }
    | { type: 'paragraph'; lines: string[]; layout: Layout }
    | { type: 'listItem'; marker: string; lines: string[]; layout: Layout }
    | { type: 'code'; lines: string[]; layout: Layout }
    | { type: 'table'; header: string[]; rows: string[][]; align: Align[]; layout: Layout }
    | { type: 'hr'; layout: Layout }
    | { type: 'toc'; items: HeadingItem[] }
    | { type: 'spacer'; size: number };

interface TextStyle {
    fontSize: number;
    lineHeight: number;
    indent: number;
    color: Rgb;
}

interface RenderState {
    pages: string[];
    commands: string[];
    y: number;
}

const COLOR_TEXT: Rgb = [0.10, 0.12, 0.14];
const COLOR_MUTED: Rgb = [0.33, 0.38, 0.43];
const COLOR_RULE: Rgb = [0.82, 0.86, 0.91];
const COLOR_QUOTE_BAR: Rgb = [0.09, 0.44, 0.79];
const COLOR_CODE_BG: Rgb = [0.96, 0.97, 0.99];
const COLOR_TABLE_HEAD_BG: Rgb = [0.93, 0.96, 0.99];
const COLOR_TABLE_ALT_BG: Rgb = [0.98, 0.99, 1.00];

const HEADING_SIZE: Record<number, number> = {
    1: 22,
    2: 19,
    3: 17,
    4: 15,
    5: 13,
    6: 12
};

const ROOT_LAYOUT: Layout = { offset: 0, quoteBars: [] };

// ---------------------------------------------------------------------------
// Markdown 解析：与网页预览（public/static/function.js）一样基于 marked（CommonMark + GFM，breaks 开启），
// 并镜像其扩展：[TOC]、==高亮==、数学公式保护。两处扩展的匹配规则需保持一致，
// tests/pdf-export.test.mjs 用与预览相同的样例覆盖。
// PDF 只有一种字体，行内格式（粗体、斜体、代码等）输出为纯文本，链接输出为「文字 (地址)」。
// ---------------------------------------------------------------------------

function tokenizeInlineMath(src: string): Tokens.Generic | undefined {
    const match = /^\\\(([\s\S]+?)\\\)/.exec(src)
        || /^\\\[([\s\S]+?)\\\]/.exec(src)
        || /^\$\$(?!\$)([\s\S]+?)\$\$/.exec(src)
        || /^\$(?!\$)((?:\\.|[^\\$\n])+?)\$(?!\d)/.exec(src);
    if (!match) return undefined;

    if (match[0].startsWith('$') && !match[0].startsWith('$$') && /^\s|\s$/.test(match[1])) {
        return undefined;
    }
    return { type: 'mathInline', raw: match[0], text: match[0] };
}

const PDF_MARKDOWN_EXTENSIONS: TokenizerExtension[] = [
    {
        name: 'toc',
        level: 'block',
        start(src) {
            const index = src.search(/^ {0,3}\[TOC\][ \t]*$/im);
            return index < 0 ? undefined : index;
        },
        tokenizer(src) {
            const match = /^ {0,3}\[TOC\][ \t]*(?:\n+|$)/i.exec(src);
            return match ? { type: 'toc', raw: match[0] } : undefined;
        }
    },
    {
        name: 'mathBlock',
        level: 'block',
        start(src) {
            const index = src.search(/^ {0,3}(?:\$\$|\\\[)/m);
            return index < 0 ? undefined : index;
        },
        tokenizer(src) {
            const match = /^ {0,3}(\$\$(?:(?!\$\$)[\s\S])+?\$\$|\\\[(?:(?!\\\])[\s\S])+?\\\])[ \t]*(?:\n+|$)/.exec(src);
            return match ? { type: 'mathBlock', raw: match[0], text: match[1] } : undefined;
        }
    },
    {
        name: 'mathInline',
        level: 'inline',
        start(src) {
            const index = src.search(/\$|\\[([]/);
            return index < 0 ? undefined : index;
        },
        tokenizer: tokenizeInlineMath
    },
    {
        name: 'mark',
        level: 'inline',
        start(src) {
            const index = src.indexOf('==');
            return index < 0 ? undefined : index;
        },
        tokenizer(src) {
            const match = /^==(?=\S)([^\n]*?\S)==/.exec(src);
            if (!match) return undefined;
            return { type: 'mark', raw: match[0], tokens: this.lexer.inlineTokens(match[1]) };
        }
    }
];

let markdownLexer: Marked | null = null;

function getMarkdownLexer(): Marked {
    if (!markdownLexer) {
        markdownLexer = new Marked({ gfm: true, breaks: true });
        markdownLexer.use({ extensions: PDF_MARKDOWN_EXTENSIONS });
    }
    return markdownLexer;
}

function decodeEntities(text: string): string {
    return text
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, code: string) => safeFromCodePoint(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => safeFromCodePoint(parseInt(code, 16)))
        .replace(/&amp;/g, '&');
}

function safeFromCodePoint(code: number): string {
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
}

function stripTags(html: string): string {
    return decodeEntities(html.replace(/<[^>]*>/g, ''));
}

// 链接显示为「文字 (地址)」；自动链接等文字与地址相同的情况只显示一次
function formatLink(label: string, href: string): string {
    if (!href) return label;
    const sameAsLabel = [label, `http://${label}`, `https://${label}`, `mailto:${label}`].includes(href);
    if (!label || sameAsLabel) return label || href;
    return `${label} (${href})`;
}

function inlineText(tokens: Token[] | undefined): string {
    if (!tokens) return '';

    return tokens.map((token) => {
        switch (token.type) {
            case 'br':
                return '\n';
            case 'codespan':
                // 代码片段内的实体按字面显示（CommonMark 规定代码内不解码实体）
                return token.text;
            case 'link':
                return formatLink(inlineText(token.tokens), token.href);
            case 'image':
                return token.text ? `[图片] ${token.text} (${token.href})` : `[图片] ${token.href}`;
            case 'html':
            case 'checkbox':
                return '';
            case 'mathInline':
            case 'escape':
                return token.text;
            default:
                if ('tokens' in token && Array.isArray(token.tokens)) {
                    return inlineText(token.tokens);
                }
                return decodeEntities(String((token as Tokens.Generic).text ?? ''));
        }
    }).join('');
}

function toLines(text: string): string[] {
    return text.split('\n').map((line) => line.replace(/[ \t]+/g, ' ').trim());
}

function collectHeadings(tokens: Token[]): HeadingItem[] {
    const headings: HeadingItem[] = [];
    const visit = (list: Token[]) => {
        for (const token of list) {
            if (token.type === 'heading') {
                headings.push({ level: token.depth, text: inlineText(token.tokens).replace(/\s+/g, ' ').trim() || '未命名标题' });
                continue;
            }
            if (token.type === 'list') {
                (token as Tokens.List).items.forEach((item) => visit(item.tokens));
            } else if (token.type === 'blockquote') {
                visit((token as Tokens.Blockquote).tokens);
            }
        }
    };
    visit(tokens);
    return headings;
}

function listMarker(list: Tokens.List, item: Tokens.ListItem, index: number): string {
    const start = typeof list.start === 'number' ? list.start : 1;
    const base = list.ordered ? `${start + index}.` : '•';
    return item.task ? `${base} [${item.checked ? 'x' : ' '}]` : base;
}

function markerWidth(marker: string, fontSize: number): number {
    return Math.max(LIST_MARKER_MIN_WIDTH, estimateTextUnits(`${marker} `) * fontSize);
}

function collectBlocks(tokens: Token[], layout: Layout, headings: HeadingItem[], out: Block[]): void {
    for (const token of tokens) {
        switch (token.type) {
            case 'space':
                out.push({ type: 'spacer', size: 8 });
                break;
            case 'heading':
                out.push({
                    type: 'heading',
                    level: token.depth,
                    text: inlineText(token.tokens).replace(/\s+/g, ' ').trim() || '未命名标题',
                    layout
                });
                break;
            case 'paragraph':
            case 'text':
                out.push({ type: 'paragraph', lines: toLines(inlineText(token.tokens ?? [token])), layout });
                break;
            case 'code':
                out.push({ type: 'code', lines: token.text.replace(/\t/g, '    ').split('\n'), layout });
                break;
            case 'mathBlock':
                out.push({ type: 'code', lines: String(token.text).split('\n'), layout });
                break;
            case 'blockquote':
                collectBlocks((token as Tokens.Blockquote).tokens, {
                    offset: layout.offset + QUOTE_INDENT,
                    quoteBars: [...layout.quoteBars, layout.offset]
                }, headings, out);
                break;
            case 'list': {
                const list = token as Tokens.List;
                list.items.forEach((item, index) => {
                    collectListItem(list, item, index, layout, headings, out);
                });
                break;
            }
            case 'table':
                out.push({
                    type: 'table',
                    header: token.header.map((cell: Tokens.TableCell) => inlineText(cell.tokens).replace(/\s+/g, ' ').trim()),
                    rows: token.rows.map((row: Tokens.TableCell[]) => row.map((cell) => inlineText(cell.tokens).replace(/\s+/g, ' ').trim())),
                    align: token.align,
                    layout
                });
                break;
            case 'hr':
                out.push({ type: 'hr', layout });
                break;
            case 'html': {
                const text = stripTags(token.text).trim();
                if (text) {
                    out.push({ type: 'paragraph', lines: toLines(text), layout });
                }
                break;
            }
            case 'toc':
                out.push({ type: 'toc', items: headings });
                break;
            default:
                // def（链接定义）等不产生可见内容
                break;
        }
    }
}

// 列表项：首个文本块与标记同行，其余子块（段落、嵌套列表、代码、引用）缩进到标记之后
function collectListItem(list: Tokens.List, item: Tokens.ListItem, index: number, layout: Layout, headings: HeadingItem[], out: Block[]): void {
    const marker = listMarker(list, item, index);
    const childLayout: Layout = { offset: layout.offset + markerWidth(marker, 11), quoteBars: layout.quoteBars };
    const children = item.tokens.filter((child) => child.type !== 'checkbox');

    const first = children[0];
    const firstIsText = first && (first.type === 'text' || first.type === 'paragraph');
    out.push({
        type: 'listItem',
        marker,
        lines: firstIsText ? toLines(inlineText((first as Tokens.Text).tokens ?? [first])) : [''],
        layout
    });

    collectBlocks(firstIsText ? children.slice(1) : children, childLayout, headings, out);
}

function compactBlocks(blocks: Block[]): Block[] {
    const output: Block[] = [];

    for (const block of blocks) {
        if (block.type !== 'spacer') {
            output.push(block);
            continue;
        }

        if (output.length === 0) continue;
        const last = output[output.length - 1];
        if (last.type === 'spacer') {
            last.size = Math.max(last.size, block.size);
            continue;
        }
        output.push(block);
    }

    while (output.length > 0 && output[0].type === 'spacer') {
        output.shift();
    }
    while (output.length > 0 && output[output.length - 1].type === 'spacer') {
        output.pop();
    }

    return output;
}

// parseMarkdownBlocks 把 Markdown 解析为 PDF 排版块（导出供测试使用）
export function parseMarkdownBlocks(markdown: string): Block[] {
    const source = (markdown || '').replace(/\r\n?/g, '\n').replace(/\u0000/g, '');
    const tokens = getMarkdownLexer().lexer(source);
    const blocks: Block[] = [];
    collectBlocks(tokens, ROOT_LAYOUT, collectHeadings(tokens), blocks);
    return compactBlocks(blocks);
}

// 字宽（em）与字体对象中声明的宽度一致：ASCII 为 /W 中的 500，其余字符为 /DW 1000
function estimateCharUnits(ch: string): number {
    if (ch === '\t') return 2;
    const code = ch.codePointAt(0) || 0;
    if (code <= 0x7f) return 0.5;
    return 1;
}

function estimateTextUnits(text: string): number {
    let units = 0;
    for (const ch of text) {
        units += estimateCharUnits(ch);
    }
    return units;
}

function wrapText(text: string, maxWidth: number, fontSize: number, collapseWhitespace: boolean): string[] {
    const source = collapseWhitespace
        ? (text || '').replace(/\s+/g, ' ').trim()
        : (text || '').replace(/\t/g, '    ').replace(/\r/g, '');

    if (!source) return [''];

    const maxUnits = Math.max(6, maxWidth / Math.max(fontSize, 1));
    const lines: string[] = [];
    let current = '';
    let units = 0;

    for (const ch of source) {
        const next = estimateCharUnits(ch);
        if (current && units + next > maxUnits) {
            lines.push(current);
            if (collapseWhitespace && ch === ' ') {
                current = '';
                units = 0;
            } else {
                current = ch;
                units = next;
            }
            continue;
        }

        current += ch;
        units += next;
    }

    if (current || lines.length === 0) {
        lines.push(current);
    }
    return lines;
}

function encodeUtf16BeHex(input: string): string {
    const text = input.length > 0 ? input : ' ';
    let hex = 'FEFF';
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        hex += code.toString(16).padStart(4, '0').toUpperCase();
    }
    return hex;
}

function fmt(value: number): string {
    return Number(value.toFixed(2)).toString();
}

function colorCmd(color: Rgb, stroke: boolean): string {
    const cmd = stroke ? 'RG' : 'rg';
    return `${fmt(color[0])} ${fmt(color[1])} ${fmt(color[2])} ${cmd}`;
}

function createState(): RenderState {
    return {
        pages: [],
        commands: [],
        y: PDF_PAGE_HEIGHT - PDF_MARGIN_TOP
    };
}

function startNewPage(state: RenderState): void {
    if (state.commands.length > 0) {
        state.pages.push(state.commands.join('\n'));
    }
    state.commands = [];
    state.y = PDF_PAGE_HEIGHT - PDF_MARGIN_TOP;
}

function ensureSpace(state: RenderState, requiredHeight: number): void {
    if (state.y - requiredHeight < PDF_MARGIN_BOTTOM) {
        startNewPage(state);
    }
}

function addGap(state: RenderState, gap: number): void {
    if (gap <= 0) return;
    ensureSpace(state, gap);
    state.y -= gap;
}

function drawRectFill(state: RenderState, x: number, yBottom: number, width: number, height: number, color: Rgb): void {
    state.commands.push('q');
    state.commands.push(colorCmd(color, false));
    state.commands.push(`${fmt(x)} ${fmt(yBottom)} ${fmt(width)} ${fmt(height)} re f`);
    state.commands.push('Q');
}

function drawRectStroke(state: RenderState, x: number, yBottom: number, width: number, height: number, color: Rgb, lineWidth: number): void {
    state.commands.push('q');
    state.commands.push(colorCmd(color, true));
    state.commands.push(`${fmt(lineWidth)} w`);
    state.commands.push(`${fmt(x)} ${fmt(yBottom)} ${fmt(width)} ${fmt(height)} re S`);
    state.commands.push('Q');
}

function drawTextAbsolute(state: RenderState, text: string, x: number, baselineY: number, fontSize: number, color: Rgb): void {
    state.commands.push('BT');
    state.commands.push(`/F1 ${fmt(fontSize)} Tf`);
    state.commands.push(colorCmd(color, false));
    state.commands.push(`1 0 0 1 ${fmt(x)} ${fmt(baselineY)} Tm`);
    state.commands.push(`<${encodeUtf16BeHex(text)}> Tj`);
    state.commands.push('ET');
}

// 在 [yBottom, yBottom + height] 区间画出各层引用的竖线
function drawQuoteBars(state: RenderState, quoteBars: number[], yBottom: number, height: number): void {
    for (const bar of quoteBars) {
        drawRectFill(state, PDF_MARGIN_X + bar, yBottom, QUOTE_BAR_WIDTH, height, COLOR_QUOTE_BAR);
    }
}

function drawFlowLine(
    state: RenderState,
    text: string,
    style: TextStyle,
    options?: { background?: Rgb; backgroundWidth?: number; quoteBars?: number[] }
): void {
    ensureSpace(state, style.lineHeight);
    const x = PDF_MARGIN_X + style.indent;
    const top = state.y;
    const baseline = top - style.fontSize;

    if (options?.quoteBars?.length) {
        drawQuoteBars(state, options.quoteBars, top - style.lineHeight, style.lineHeight);
    }

    if (options?.background) {
        const width = options.backgroundWidth || (PDF_CONTENT_WIDTH - style.indent);
        const yBottom = top - style.lineHeight + 2;
        drawRectFill(state, x - 2, yBottom, width + 4, style.lineHeight - 1, options.background);
    }

    drawTextAbsolute(state, text, x, baseline, style.fontSize, style.color);
    state.y -= style.lineHeight;
}

// 块之间的间距也要延续引用竖线，否则多段引用会断开
function addLayoutGap(state: RenderState, gap: number, layout: Layout): void {
    if (gap <= 0) return;
    ensureSpace(state, gap);
    if (layout.quoteBars.length > 0) {
        drawQuoteBars(state, layout.quoteBars, state.y - gap, gap);
    }
    state.y -= gap;
}

function textColor(layout: Layout): Rgb {
    return layout.quoteBars.length > 0 ? COLOR_MUTED : COLOR_TEXT;
}

function drawHorizontalRule(state: RenderState, layout: Layout): void {
    ensureSpace(state, 10);
    const y = state.y - 4;
    const x1 = PDF_MARGIN_X + layout.offset;
    const x2 = PDF_PAGE_WIDTH - PDF_MARGIN_X;

    state.commands.push('q');
    state.commands.push(colorCmd(COLOR_RULE, true));
    state.commands.push('1 w');
    state.commands.push(`${fmt(x1)} ${fmt(y)} m ${fmt(x2)} ${fmt(y)} l S`);
    state.commands.push('Q');
    drawQuoteBars(state, layout.quoteBars, state.y - 10, 10);
    state.y -= 10;
}

function renderWrappedLines(state: RenderState, lines: string[], style: TextStyle, layout: Layout): void {
    const maxWidth = PDF_CONTENT_WIDTH - style.indent;
    for (const sourceLine of lines) {
        for (const line of wrapText(sourceLine, maxWidth, style.fontSize, true)) {
            drawFlowLine(state, line, style, { quoteBars: layout.quoteBars });
        }
    }
}

function renderHeading(state: RenderState, level: number, text: string, layout: Layout): void {
    const fontSize = HEADING_SIZE[level] || 12;
    const style: TextStyle = {
        fontSize,
        lineHeight: fontSize + 8,
        indent: layout.offset,
        color: textColor(layout)
    };
    addLayoutGap(state, level <= 2 ? 10 : 8, layout);
    renderWrappedLines(state, [text], style, layout);
    addLayoutGap(state, 4, layout);
}

function renderParagraph(state: RenderState, lines: string[], layout: Layout): void {
    const style: TextStyle = {
        fontSize: 11,
        lineHeight: 17,
        indent: layout.offset,
        color: textColor(layout)
    };
    renderWrappedLines(state, lines, style, layout);
    addLayoutGap(state, 4, layout);
}

function renderListItem(state: RenderState, marker: string, lines: string[], layout: Layout): void {
    const fontSize = 11;
    const lineHeight = 17;
    const contentIndent = layout.offset + markerWidth(marker, fontSize);
    const style: TextStyle = { fontSize, lineHeight, indent: contentIndent, color: textColor(layout) };
    const maxWidth = PDF_CONTENT_WIDTH - contentIndent;

    const wrapped = lines.flatMap((line) => wrapText(line, maxWidth, fontSize, true));
    wrapped.forEach((line, index) => {
        if (index === 0) {
            // 先确保本行空间，再画标记，避免标记与文字被分页拆开
            ensureSpace(state, lineHeight);
            drawTextAbsolute(state, marker, PDF_MARGIN_X + layout.offset, state.y - fontSize, fontSize, style.color);
        }
        drawFlowLine(state, line, style, { quoteBars: layout.quoteBars });
    });

    addLayoutGap(state, 2, layout);
}

function renderCodeBlock(state: RenderState, lines: string[], layout: Layout): void {
    const style: TextStyle = {
        fontSize: 10,
        lineHeight: 15,
        indent: layout.offset + 12,
        color: COLOR_TEXT
    };
    const maxWidth = PDF_CONTENT_WIDTH - style.indent - 4;
    const options = { background: COLOR_CODE_BG, backgroundWidth: maxWidth, quoteBars: layout.quoteBars };
    addLayoutGap(state, 4, layout);

    const source = lines.length > 0 ? lines : [' '];
    for (const rawLine of source) {
        for (const line of wrapText(rawLine || ' ', maxWidth, style.fontSize, false)) {
            drawFlowLine(state, line || ' ', style, options);
        }
    }

    addLayoutGap(state, 6, layout);
}

function renderToc(state: RenderState, items: HeadingItem[]): void {
    renderHeading(state, 4, '目录', ROOT_LAYOUT);
    if (items.length === 0) {
        renderParagraph(state, ['（无可用标题）'], ROOT_LAYOUT);
        return;
    }

    for (const item of items) {
        const layout: Layout = { offset: Math.max(0, item.level - 1) * 16, quoteBars: [] };
        renderListItem(state, '•', [item.text], layout);
    }
    addGap(state, 4);
}

function normalizeRow<T>(row: T[], colCount: number, fill: T): T[] {
    const normalized = [...row];
    while (normalized.length < colCount) normalized.push(fill);
    if (normalized.length > colCount) {
        normalized.length = colCount;
    }
    return normalized;
}

function computeColumnWidths(header: string[], rows: string[][], totalWidth: number): number[] {
    const colCount = header.length;
    const weights = new Array(colCount).fill(1);

    for (const row of [header, ...rows]) {
        for (let i = 0; i < colCount; i++) {
            const units = Math.min(26, estimateTextUnits(row[i] || '') + 2);
            if (units > weights[i]) weights[i] = units;
        }
    }

    const minWidth = 72;
    if (colCount * minWidth > totalWidth) {
        return new Array(colCount).fill(totalWidth / colCount);
    }

    const totalWeight = weights.reduce((acc, val) => acc + val, 0);
    let widths = weights.map((w) => (totalWidth * w) / totalWeight);
    widths = widths.map((w) => Math.max(minWidth, w));

    const sum = widths.reduce((acc, val) => acc + val, 0);
    const scale = totalWidth / sum;
    widths = widths.map((w) => w * scale);

    const diff = totalWidth - widths.reduce((acc, val) => acc + val, 0);
    widths[widths.length - 1] += diff;
    return widths;
}

function measureTableRow(cells: string[], widths: number[], isHeader: boolean): {
    height: number;
    wrapped: string[][];
    fontSize: number;
    lineHeight: number;
    paddingX: number;
    paddingY: number;
} {
    const fontSize = isHeader ? 11 : 10.5;
    const lineHeight = isHeader ? 16 : 15;
    const paddingX = 6;
    const paddingY = 5;
    const wrapped: string[][] = [];
    let maxLines = 1;

    for (let i = 0; i < widths.length; i++) {
        const cellText = cells[i] || '';
        const textWidth = Math.max(10, widths[i] - paddingX * 2);
        const lines = wrapText(cellText, textWidth, fontSize, true);
        wrapped.push(lines);
        if (lines.length > maxLines) maxLines = lines.length;
    }

    const height = maxLines * lineHeight + paddingY * 2;
    return { height, wrapped, fontSize, lineHeight, paddingX, paddingY };
}

// 按列对齐方式计算单元格内一行文字的起点（宽度为估算值）
function alignedTextX(cellX: number, cellWidth: number, paddingX: number, text: string, fontSize: number, align: Align): number {
    if (align !== 'center' && align !== 'right') {
        return cellX + paddingX;
    }
    const textWidth = estimateTextUnits(text) * fontSize;
    const offset = align === 'center'
        ? (cellWidth - textWidth) / 2
        : cellWidth - paddingX - textWidth;
    return cellX + Math.max(paddingX, offset);
}

interface TableGeometry {
    x: number;
    widths: number[];
    align: Align[];
    layout: Layout;
}

function drawTableRow(state: RenderState, cells: string[], table: TableGeometry, isHeader: boolean, zebraIndex: number): number {
    const metrics = measureTableRow(cells, table.widths, isHeader);
    const rowHeight = metrics.height;
    ensureSpace(state, rowHeight);

    const yTop = state.y;
    const yBottom = yTop - rowHeight;
    const totalWidth = table.widths.reduce((acc, val) => acc + val, 0);
    const rowBg = isHeader
        ? COLOR_TABLE_HEAD_BG
        : (zebraIndex % 2 === 0 ? COLOR_TABLE_ALT_BG : [1, 1, 1] as Rgb);

    drawQuoteBars(state, table.layout.quoteBars, yBottom, rowHeight);
    drawRectFill(state, table.x, yBottom, totalWidth, rowHeight, rowBg);

    let x = table.x;
    for (let col = 0; col < table.widths.length; col++) {
        const width = table.widths[col];
        drawRectStroke(state, x, yBottom, width, rowHeight, COLOR_RULE, 0.7);

        metrics.wrapped[col].forEach((line, lineIndex) => {
            const baseline = yTop - metrics.paddingY - metrics.fontSize - lineIndex * metrics.lineHeight;
            const textX = alignedTextX(x, width, metrics.paddingX, line, metrics.fontSize, table.align[col]);
            drawTextAbsolute(state, line, textX, baseline, metrics.fontSize, COLOR_TEXT);
        });

        x += width;
    }

    state.y -= rowHeight;
    return rowHeight;
}

function renderTable(state: RenderState, header: string[], rows: string[][], align: Align[], layout: Layout): void {
    const colCount = Math.max(1, header.length, ...rows.map((row) => row.length));
    const normalizedHeader = normalizeRow(header, colCount, '');
    const normalizedRows = rows.map((row) => normalizeRow(row, colCount, ''));
    const totalWidth = PDF_CONTENT_WIDTH - layout.offset;
    const table: TableGeometry = {
        x: PDF_MARGIN_X + layout.offset,
        widths: computeColumnWidths(normalizedHeader, normalizedRows, totalWidth),
        align: normalizeRow(align, colCount, null),
        layout
    };

    addLayoutGap(state, 6, layout);

    // 表格分页时重复表头
    drawTableRow(state, normalizedHeader, table, true, 0);
    for (let i = 0; i < normalizedRows.length; i++) {
        const nextMetrics = measureTableRow(normalizedRows[i], table.widths, false);
        if (state.y - nextMetrics.height < PDF_MARGIN_BOTTOM) {
            startNewPage(state);
            drawTableRow(state, normalizedHeader, table, true, 0);
        }
        drawTableRow(state, normalizedRows[i], table, false, i);
    }

    addLayoutGap(state, 8, layout);
}

function appendPageFooter(stream: string, pageIndex: number, totalPages: number): string {
    const footer = `第 ${pageIndex + 1} / ${totalPages} 页`;
    const x = PDF_PAGE_WIDTH / 2 - 30;
    const y = 22;
    return `${stream}\nBT\n/F1 9 Tf\n${colorCmd(COLOR_MUTED, false)}\n1 0 0 1 ${fmt(x)} ${fmt(y)} Tm\n<${encodeUtf16BeHex(footer)}> Tj\nET`;
}

function renderBlocksToPages(blocks: Block[]): string[] {
    const state = createState();

    if (blocks.length === 0) {
        renderParagraph(state, [''], ROOT_LAYOUT);
    } else {
        for (const block of blocks) {
            switch (block.type) {
                case 'heading':
                    renderHeading(state, block.level, block.text, block.layout);
                    break;
                case 'paragraph':
                    renderParagraph(state, block.lines, block.layout);
                    break;
                case 'listItem':
                    renderListItem(state, block.marker, block.lines, block.layout);
                    break;
                case 'code':
                    renderCodeBlock(state, block.lines, block.layout);
                    break;
                case 'table':
                    renderTable(state, block.header, block.rows, block.align, block.layout);
                    break;
                case 'hr':
                    addLayoutGap(state, 4, block.layout);
                    drawHorizontalRule(state, block.layout);
                    addLayoutGap(state, 4, block.layout);
                    break;
                case 'toc':
                    renderToc(state, block.items);
                    break;
                case 'spacer':
                    addGap(state, block.size);
                    break;
            }
        }
    }

    if (state.commands.length > 0) {
        state.pages.push(state.commands.join('\n'));
    }
    if (state.pages.length === 0) {
        state.pages.push('BT\n/F1 11 Tf\n1 0 0 1 44 780 Tm\n<FEFF0020> Tj\nET');
    }

    return state.pages.map((stream, idx, arr) => appendPageFooter(stream, idx, arr.length));
}

function buildPdfDocument(pageStreams: string[]): Uint8Array {
    const objects: string[] = [];
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[2] = '';
    // 内置中易宋体（GB）以保证中文可显示
    objects[3] = '<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [4 0 R] >>';
    // Adobe-GB1 的 CID 1-95 对应 ASCII 0x20-0x7E：声明为半角宽度，否则会按 /DW 1000 全角排布，英文字母间距过大
    objects[4] = '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /FontDescriptor 5 0 R /DW 1000 /W [1 95 500] >>';
    objects[5] = '<< /Type /FontDescriptor /FontName /STSong-Light /Flags 4 /Ascent 880 /Descent -120 /CapHeight 700 /ItalicAngle 0 /StemV 80 /MissingWidth 500 >>';

    let nextId = 6;
    const pageIds: number[] = [];

    for (const stream of pageStreams) {
        const pageId = nextId++;
        const contentId = nextId++;
        pageIds.push(pageId);

        objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
        objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    }

    objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

    const maxId = nextId - 1;
    let pdf = '%PDF-1.4\n';
    const offsets: number[] = new Array(maxId + 1).fill(0);

    for (let id = 1; id <= maxId; id++) {
        const body = objects[id];
        if (!body) continue;
        offsets[id] = pdf.length;
        pdf += `${id} 0 obj\n${body}\nendobj\n`;
    }

    const xrefPos = pdf.length;
    pdf += `xref\n0 ${maxId + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let id = 1; id <= maxId; id++) {
        pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    }

    pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
    return new TextEncoder().encode(pdf);
}

export function buildMarkdownPdf(markdown: string): Uint8Array {
    const blocks = parseMarkdownBlocks(markdown);
    const pages = renderBlocksToPages(blocks);
    return buildPdfDocument(pages);
}
