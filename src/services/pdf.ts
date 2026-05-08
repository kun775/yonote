const PDF_PAGE_WIDTH = 595;
const PDF_PAGE_HEIGHT = 842;
const PDF_MARGIN_X = 44;
const PDF_MARGIN_TOP = 52;
const PDF_MARGIN_BOTTOM = 48;
const PDF_CONTENT_WIDTH = PDF_PAGE_WIDTH - PDF_MARGIN_X * 2;

type Rgb = [number, number, number];

interface HeadingItem {
    level: number;
    text: string;
}

type Block =
    | { type: 'heading'; level: number; text: string }
    | { type: 'paragraph'; text: string }
    | { type: 'list'; marker: string; depth: number; text: string }
    | { type: 'quote'; lines: string[] }
    | { type: 'code'; lines: string[] }
    | { type: 'table'; header: string[]; rows: string[][] }
    | { type: 'hr' }
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

function normalizeMarkdown(content: string): string {
    return (content || '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\u0000/g, '');
}

function stripInlineMarkdown(text: string): string {
    let out = text || '';

    out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt: string, url: string) => {
        const safeAlt = (alt || '').trim();
        const safeUrl = (url || '').trim();
        if (safeAlt) return `[图片] ${safeAlt} (${safeUrl})`;
        return `[图片] ${safeUrl}`;
    });
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
    out = out.replace(/`([^`]+)`/g, '$1');
    out = out.replace(/\*\*(.*?)\*\*/g, '$1');
    out = out.replace(/__(.*?)__/g, '$1');
    out = out.replace(/~~(.*?)~~/g, '$1');
    out = out.replace(/\*(.*?)\*/g, '$1');
    out = out.replace(/_(.*?)_/g, '$1');
    out = out.replace(/\\([\\`*_{}\[\]()#+\-.!>])/g, '$1');
    out = out.replace(/<\/?[^>]+>/g, '');
    out = out.replace(/&nbsp;/g, ' ');
    out = out.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    return out.trim();
}

function estimateCharUnits(ch: string): number {
    if (ch === '\t') return 2.2;
    if (ch === ' ') return 0.35;
    const code = ch.codePointAt(0) || 0;
    if (code <= 0x7f) return 0.55;
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

function isTableSeparatorLine(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed.includes('|')) return false;

    let body = trimmed;
    if (body.startsWith('|')) body = body.slice(1);
    if (body.endsWith('|')) body = body.slice(0, -1);

    const cells = body.split('|').map((cell) => cell.trim()).filter((cell) => cell.length > 0);
    if (cells.length < 2) return false;
    return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseTableRow(line: string): string[] {
    let body = line.trim();
    if (body.startsWith('|')) body = body.slice(1);
    if (body.endsWith('|')) body = body.slice(0, -1);
    return body.split('|').map((cell) => stripInlineMarkdown(cell.trim()));
}

function collectHeadings(lines: string[]): HeadingItem[] {
    const headings: HeadingItem[] = [];
    let fence: string | null = null;

    for (const line of lines) {
        const trimmed = line.trim();
        if (fence) {
            if (trimmed.startsWith(fence)) {
                fence = null;
            }
            continue;
        }

        const fenceMatch = trimmed.match(/^(```|~~~)/);
        if (fenceMatch) {
            fence = fenceMatch[1];
            continue;
        }

        const match = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
        if (!match) continue;
        headings.push({
            level: match[1].length,
            text: stripInlineMarkdown(match[2]) || '未命名标题'
        });
    }

    return headings;
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

function parseBlocks(markdown: string): Block[] {
    const lines = normalizeMarkdown(markdown).split('\n');
    const headings = collectHeadings(lines);
    const blocks: Block[] = [];

    const paragraphBuffer: string[] = [];
    const quoteBuffer: string[] = [];
    let fence: string | null = null;
    let codeBuffer: string[] = [];

    const flushParagraph = () => {
        if (paragraphBuffer.length === 0) return;
        const text = stripInlineMarkdown(paragraphBuffer.join(' ')).replace(/\s+/g, ' ').trim();
        if (text) {
            blocks.push({ type: 'paragraph', text });
        }
        paragraphBuffer.length = 0;
    };

    const flushQuote = () => {
        if (quoteBuffer.length === 0) return;
        const linesOut = quoteBuffer
            .map((line) => stripInlineMarkdown(line).trim())
            .filter((line) => line.length > 0);
        if (linesOut.length > 0) {
            blocks.push({ type: 'quote', lines: linesOut });
        }
        quoteBuffer.length = 0;
    };

    const flushCode = () => {
        blocks.push({ type: 'code', lines: [...codeBuffer] });
        codeBuffer = [];
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (fence) {
            if (trimmed.startsWith(fence)) {
                fence = null;
                flushCode();
            } else {
                codeBuffer.push(line.replace(/\t/g, '    '));
            }
            continue;
        }

        const fenceMatch = trimmed.match(/^(```|~~~)/);
        if (fenceMatch) {
            flushParagraph();
            flushQuote();
            fence = fenceMatch[1];
            continue;
        }

        if (/^\s*$/.test(line)) {
            flushParagraph();
            flushQuote();
            blocks.push({ type: 'spacer', size: 8 });
            continue;
        }

        if (/^\s*\[TOC\]\s*$/i.test(line)) {
            flushParagraph();
            flushQuote();
            blocks.push({ type: 'toc', items: headings });
            continue;
        }

        const headingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
        if (headingMatch) {
            flushParagraph();
            flushQuote();
            blocks.push({
                type: 'heading',
                level: headingMatch[1].length,
                text: stripInlineMarkdown(headingMatch[2]) || '未命名标题'
            });
            continue;
        }

        if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(trimmed)) {
            flushParagraph();
            flushQuote();
            blocks.push({ type: 'hr' });
            continue;
        }

        const nextLine = lines[i + 1] || '';
        if (
            line.includes('|')
            && isTableSeparatorLine(nextLine)
        ) {
            const header = parseTableRow(line);
            if (header.length >= 2 && header.some((cell) => cell.length > 0)) {
                flushParagraph();
                flushQuote();

                i += 2; // skip header + separator
                const rows: string[][] = [];
                while (i < lines.length) {
                    const rowLine = lines[i];
                    if (!rowLine.trim()) break;
                    if (!rowLine.includes('|')) break;
                    if (isTableSeparatorLine(rowLine)) {
                        i++;
                        continue;
                    }
                    rows.push(parseTableRow(rowLine));
                    i++;
                }
                i -= 1;

                blocks.push({ type: 'table', header, rows });
                continue;
            }
        }

        const quoteMatch = line.match(/^\s*>\s?(.*)$/);
        if (quoteMatch) {
            flushParagraph();
            quoteBuffer.push(quoteMatch[1]);
            continue;
        }
        flushQuote();

        const orderedMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
        if (orderedMatch) {
            flushParagraph();
            const depth = Math.floor(orderedMatch[1].replace(/\t/g, '    ').length / 2);
            blocks.push({
                type: 'list',
                marker: `${orderedMatch[2]}.`,
                depth,
                text: stripInlineMarkdown(orderedMatch[3])
            });
            continue;
        }

        const bulletMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
        if (bulletMatch) {
            flushParagraph();
            const depth = Math.floor(bulletMatch[1].replace(/\t/g, '    ').length / 2);
            blocks.push({
                type: 'list',
                marker: '•',
                depth,
                text: stripInlineMarkdown(bulletMatch[2])
            });
            continue;
        }

        paragraphBuffer.push(line.trim());
    }

    if (fence) {
        flushCode();
    }
    flushParagraph();
    flushQuote();

    return compactBlocks(blocks);
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

function drawFlowLine(state: RenderState, text: string, style: TextStyle, options?: { background?: Rgb; backgroundWidth?: number }): void {
    ensureSpace(state, style.lineHeight);
    const x = PDF_MARGIN_X + style.indent;
    const top = state.y;
    const baseline = top - style.fontSize;

    if (options?.background) {
        const width = options.backgroundWidth || (PDF_CONTENT_WIDTH - style.indent);
        const yBottom = top - style.lineHeight + 2;
        drawRectFill(state, x - 2, yBottom, width + 4, style.lineHeight - 1, options.background);
    }

    drawTextAbsolute(state, text, x, baseline, style.fontSize, style.color);
    state.y -= style.lineHeight;
}

function drawHorizontalRule(state: RenderState): void {
    ensureSpace(state, 10);
    const y = state.y - 4;
    const x1 = PDF_MARGIN_X;
    const x2 = PDF_PAGE_WIDTH - PDF_MARGIN_X;

    state.commands.push('q');
    state.commands.push(colorCmd(COLOR_RULE, true));
    state.commands.push('1 w');
    state.commands.push(`${fmt(x1)} ${fmt(y)} m ${fmt(x2)} ${fmt(y)} l S`);
    state.commands.push('Q');
    state.y -= 10;
}

function renderWrappedText(state: RenderState, text: string, style: TextStyle, collapseWhitespace: boolean): void {
    const maxWidth = PDF_CONTENT_WIDTH - style.indent;
    const lines = wrapText(text, maxWidth, style.fontSize, collapseWhitespace);
    for (const line of lines) {
        drawFlowLine(state, line, style);
    }
}

function renderHeading(state: RenderState, level: number, text: string): void {
    const fontSize = HEADING_SIZE[level] || 12;
    const style: TextStyle = {
        fontSize,
        lineHeight: fontSize + 8,
        indent: 0,
        color: COLOR_TEXT
    };
    addGap(state, level <= 2 ? 10 : 8);
    renderWrappedText(state, text, style, true);
    addGap(state, 4);
}

function renderParagraph(state: RenderState, text: string): void {
    const style: TextStyle = {
        fontSize: 11,
        lineHeight: 17,
        indent: 0,
        color: COLOR_TEXT
    };
    renderWrappedText(state, text, style, true);
    addGap(state, 4);
}

function renderListItem(state: RenderState, marker: string, depth: number, text: string): void {
    const safeDepth = Math.min(7, Math.max(0, depth));
    const indent = safeDepth * 16;
    const markerPrefix = `${marker} `;
    const style: TextStyle = {
        fontSize: 11,
        lineHeight: 17,
        indent,
        color: COLOR_TEXT
    };
    const markerWidth = 18;
    const maxWidth = PDF_CONTENT_WIDTH - indent - markerWidth;
    const lines = wrapText(text, maxWidth, style.fontSize, true);

    lines.forEach((line, index) => {
        if (index === 0) {
            drawFlowLine(state, `${markerPrefix}${line}`, style);
        } else {
            drawFlowLine(state, `${' '.repeat(markerPrefix.length)}${line}`, style);
        }
    });

    addGap(state, 2);
}

function renderQuote(state: RenderState, lines: string[]): void {
    const style: TextStyle = {
        fontSize: 10.5,
        lineHeight: 16,
        indent: 10,
        color: COLOR_MUTED
    };
    for (const line of lines) {
        const wrapped = wrapText(line, PDF_CONTENT_WIDTH - style.indent - 14, style.fontSize, true);
        for (const piece of wrapped) {
            drawFlowLine(state, `| ${piece}`, style);
        }
    }
    addGap(state, 4);
}

function renderCodeBlock(state: RenderState, lines: string[]): void {
    const style: TextStyle = {
        fontSize: 10,
        lineHeight: 15,
        indent: 12,
        color: COLOR_TEXT
    };
    const maxWidth = PDF_CONTENT_WIDTH - style.indent - 4;
    addGap(state, 4);

    if (lines.length === 0) {
        drawFlowLine(state, ' ', style, { background: COLOR_CODE_BG, backgroundWidth: maxWidth });
        addGap(state, 6);
        return;
    }

    for (const rawLine of lines) {
        const wrapped = wrapText(rawLine || ' ', maxWidth, style.fontSize, false);
        for (const line of wrapped) {
            drawFlowLine(state, line || ' ', style, {
                background: COLOR_CODE_BG,
                backgroundWidth: maxWidth
            });
        }
    }

    addGap(state, 6);
}

function renderToc(state: RenderState, items: HeadingItem[]): void {
    renderHeading(state, 4, '目录');
    if (items.length === 0) {
        renderParagraph(state, '（无可用标题）');
        return;
    }

    for (const item of items) {
        renderListItem(state, '•', Math.max(0, item.level - 1), item.text);
    }
    addGap(state, 4);
}

function normalizeRow(row: string[], colCount: number): string[] {
    const normalized = [...row];
    while (normalized.length < colCount) normalized.push('');
    if (normalized.length > colCount) {
        normalized.length = colCount;
    }
    return normalized;
}

function computeColumnWidths(header: string[], rows: string[][]): number[] {
    const colCount = Math.max(2, header.length, ...rows.map((row) => row.length));
    const weights = new Array(colCount).fill(1);

    const allRows = [normalizeRow(header, colCount), ...rows.map((row) => normalizeRow(row, colCount))];
    for (const row of allRows) {
        for (let i = 0; i < colCount; i++) {
            const units = Math.min(26, estimateTextUnits(row[i] || '') + 2);
            if (units > weights[i]) weights[i] = units;
        }
    }

    const minWidth = 72;
    if (colCount * minWidth > PDF_CONTENT_WIDTH) {
        const equal = PDF_CONTENT_WIDTH / colCount;
        return new Array(colCount).fill(equal);
    }

    const totalWeight = weights.reduce((acc, val) => acc + val, 0);
    let widths = weights.map((w) => (PDF_CONTENT_WIDTH * w) / totalWeight);
    widths = widths.map((w) => Math.max(minWidth, w));

    const sum = widths.reduce((acc, val) => acc + val, 0);
    const scale = PDF_CONTENT_WIDTH / sum;
    widths = widths.map((w) => w * scale);

    const diff = PDF_CONTENT_WIDTH - widths.reduce((acc, val) => acc + val, 0);
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

function drawTableRow(
    state: RenderState,
    cells: string[],
    widths: number[],
    isHeader: boolean,
    zebraIndex: number
): number {
    const metrics = measureTableRow(cells, widths, isHeader);
    const rowHeight = metrics.height;
    ensureSpace(state, rowHeight);

    const yTop = state.y;
    const yBottom = yTop - rowHeight;
    const rowBg = isHeader
        ? COLOR_TABLE_HEAD_BG
        : (zebraIndex % 2 === 0 ? COLOR_TABLE_ALT_BG : [1, 1, 1] as Rgb);

    drawRectFill(state, PDF_MARGIN_X, yBottom, PDF_CONTENT_WIDTH, rowHeight, rowBg);

    let x = PDF_MARGIN_X;
    for (let col = 0; col < widths.length; col++) {
        const width = widths[col];
        drawRectStroke(state, x, yBottom, width, rowHeight, COLOR_RULE, 0.7);

        const lines = metrics.wrapped[col];
        lines.forEach((line, lineIndex) => {
            const baseline = yTop - metrics.paddingY - metrics.fontSize - lineIndex * metrics.lineHeight;
            drawTextAbsolute(state, line, x + metrics.paddingX, baseline, metrics.fontSize, COLOR_TEXT);
        });

        x += width;
    }

    state.y -= rowHeight;
    return rowHeight;
}

function renderTable(state: RenderState, header: string[], rows: string[][]): void {
    const colCount = Math.max(2, header.length, ...rows.map((row) => row.length));
    const normalizedHeader = normalizeRow(header, colCount);
    const normalizedRows = rows.map((row) => normalizeRow(row, colCount));
    const widths = computeColumnWidths(normalizedHeader, normalizedRows);

    addGap(state, 6);

    // 表格分页时重复表头
    drawTableRow(state, normalizedHeader, widths, true, 0);
    for (let i = 0; i < normalizedRows.length; i++) {
        const nextMetrics = measureTableRow(normalizedRows[i], widths, false);
        if (state.y - nextMetrics.height < PDF_MARGIN_BOTTOM) {
            startNewPage(state);
            drawTableRow(state, normalizedHeader, widths, true, 0);
        }
        drawTableRow(state, normalizedRows[i], widths, false, i);
    }

    addGap(state, 8);
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
        renderParagraph(state, '');
    } else {
        for (const block of blocks) {
            switch (block.type) {
                case 'heading':
                    renderHeading(state, block.level, block.text);
                    break;
                case 'paragraph':
                    renderParagraph(state, block.text);
                    break;
                case 'list':
                    renderListItem(state, block.marker, block.depth, block.text);
                    break;
                case 'quote':
                    renderQuote(state, block.lines);
                    break;
                case 'code':
                    renderCodeBlock(state, block.lines);
                    break;
                case 'table':
                    renderTable(state, block.header, block.rows);
                    break;
                case 'hr':
                    addGap(state, 4);
                    drawHorizontalRule(state);
                    addGap(state, 4);
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
    objects[4] = '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /FontDescriptor 5 0 R /DW 1000 >>';
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
    const blocks = parseBlocks(markdown);
    const pages = renderBlocksToPages(blocks);
    return buildPdfDocument(pages);
}

