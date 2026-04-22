import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function createPreviewContext() {
    return {
        window: {
            noteUpdatedAt: 0,
            noteKey: 'preview-test',
            location: { pathname: '/preview-test' },
            innerHeight: 800
        },
        navigator: { userAgent: 'node' },
        document: {
            getElementById: () => null,
            querySelector: () => null,
            querySelectorAll: () => [],
            body: {
                appendChild() {},
                removeChild() {}
            }
        },
        localStorage: {
            getItem: () => null,
            setItem() {}
        },
        setTimeout,
        clearTimeout,
        console,
        btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
        atob: (value) => Buffer.from(value, 'base64').toString('binary')
    };
}

function loadConvertToHtml() {
    const filePath = path.resolve('public/static/function.js');
    const source = fs.readFileSync(filePath, 'utf8');
    const context = createPreviewContext();

    vm.createContext(context);
    vm.runInContext(source, context, { filename: filePath });

    return context.convertToHtml;
}

test('convertToHtml 能正确保留代码、链接与强调语法', () => {
    const convertToHtml = loadConvertToHtml();
    const html = convertToHtml('`code` _ok_ [link](https://example.com)');

    assert.match(html, /<code>code<\/code>/);
    assert.match(html, /<em>ok<\/em>/);
    assert.match(html, /<a href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer">link<\/a>/);
    assert.doesNotMatch(html, /INLINE-TOKEN/);
});

test('convertToHtml 生成目录时会转义标题内容', () => {
    const convertToHtml = loadConvertToHtml();
    const html = convertToHtml('# <img src=x onerror=1>\n\n[TOC]');

    assert.match(html, /<h1 id="img-srcx-onerror1-0">&lt;img src=x onerror=1&gt;<\/h1>/);
    assert.match(html, /&lt;img src=x onerror=1&gt;<\/a>/);
    assert.doesNotMatch(html, /<a href="#img-srcx-onerror1-0" class="toc-link toc-level-1"><img src=x onerror=1><\/a>/);
});
