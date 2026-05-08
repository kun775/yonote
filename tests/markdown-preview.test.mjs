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
            location: { pathname: '/preview-test', href: '/preview-test' },
            innerHeight: 800
        },
        navigator: { userAgent: 'node' },
        document: {
            getElementById: () => null,
            querySelector: () => null,
            querySelectorAll: () => [],
            body: {
                dataset: {
                    authenticated: 'false',
                    noteUpdatedAt: '0',
                    noteKey: 'preview-test',
                    viewOnly: 'false',
                    password: 'false',
                    public: 'false'
                },
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
        fetch: async () => ({ ok: false, status: 404 }),
        console,
        btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
        atob: (value) => Buffer.from(value, 'base64').toString('binary')
    };
}

function loadFunctionContext(overrides = {}) {
    const filePath = path.resolve('public/static/function.js');
    const source = fs.readFileSync(filePath, 'utf8');
    const context = Object.assign(createPreviewContext(), overrides);

    vm.createContext(context);
    vm.runInContext(source, context, { filename: filePath });

    return context;
}

function loadConvertToHtml() {
    return loadFunctionContext().convertToHtml;
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

test('checkNoteProtectionStatus 检测到公开保护后跳转到只读页', async () => {
    const context = loadFunctionContext({
        fetch: async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                note: {
                    hasPassword: true,
                    public: true
                }
            })
        })
    });

    await context.checkNoteProtectionStatus();

    assert.equal(context.window.password, true);
    assert.equal(context.window.public, true);
    assert.equal(context.window.location.href, '/preview-test?view=1');
});

test('checkNoteProtectionStatus 检测到私有保护后跳转到密码页', async () => {
    const context = loadFunctionContext({
        fetch: async () => ({
            ok: false,
            status: 403
        })
    });

    await context.checkNoteProtectionStatus();

    assert.equal(context.window.password, true);
    assert.equal(context.window.public, false);
    assert.equal(context.window.location.href, '/preview-test');
});

test('checkNoteProtectionStatus 在本地无未保存内容时同步远端最新内容', async () => {
    const elements = {
        content: { value: '旧内容' },
        'settings-content-input': { value: '旧内容' },
        'last-updated': { textContent: '' }
    };
    const context = loadFunctionContext({
        document: {
            getElementById: (id) => elements[id] || null,
            querySelector: () => null,
            querySelectorAll: () => [],
            dispatchEvent(event) {
                context.dispatchedEvent = event;
                return true;
            },
            body: {
                dataset: {
                    authenticated: 'false',
                    noteUpdatedAt: '0',
                    noteKey: 'preview-test',
                    viewOnly: 'false',
                    password: 'false',
                    public: 'false'
                },
                appendChild() {},
                removeChild() {}
            }
        },
        CustomEvent,
        fetch: async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                note: {
                    content: '新内容',
                    updatedAt: 10,
                    hasPassword: false,
                    public: false
                }
            })
        })
    });

    await context.checkNoteProtectionStatus();

    assert.equal(elements.content.value, '新内容');
    assert.equal(elements['settings-content-input'].value, '新内容');
    assert.equal(context.window.noteUpdatedAt, 10);
    assert.equal(context.dispatchedEvent.type, 'yonote:content-updated');
});

test('checkNoteProtectionStatus 不覆盖本地未保存内容', async () => {
    const elements = {
        content: { value: '本地内容' },
        'last-updated': { textContent: '' }
    };
    const context = loadFunctionContext({
        window: {
            noteUpdatedAt: 0,
            noteKey: 'preview-test',
            location: { pathname: '/preview-test', href: '/preview-test' },
            innerHeight: 800,
            noteDirty: true
        },
        document: {
            getElementById: (id) => elements[id] || null,
            querySelector: () => null,
            querySelectorAll: () => [],
            dispatchEvent() {
                return true;
            },
            body: {
                dataset: {
                    authenticated: 'false',
                    noteUpdatedAt: '0',
                    noteKey: 'preview-test',
                    viewOnly: 'false',
                    password: 'false',
                    public: 'false'
                },
                appendChild() {},
                removeChild() {}
            }
        },
        fetch: async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                note: {
                    content: '远端内容',
                    updatedAt: 10,
                    hasPassword: false,
                    public: false
                }
            })
        })
    });

    context.window.noteDirty = true;
    await context.checkNoteProtectionStatus();

    assert.equal(elements.content.value, '本地内容');
});
