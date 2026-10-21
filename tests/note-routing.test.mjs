import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

import { MemoryD1, createTestEnv } from './helpers/memory-d1.mjs';

async function loadNoteRoutes() {
    const result = await build({
        entryPoints: ['src/routes/note.tsx'],
        bundle: true,
        format: 'esm',
        platform: 'node',
        target: 'es2022',
        write: false
    });

    const source = result.outputFiles[0].text;
    const encoded = Buffer.from(source).toString('base64');
    return import(`data:text/javascript;base64,${encoded}`);
}

const { noteRoutes } = await loadNoteRoutes();

test('GET /favicon.ico 不应被当作 note key 并重定向到新笔记', async () => {
    const response = await noteRoutes.request('/favicon.ico');

    assert.equal(response.status, 404);
    assert.equal(response.headers.get('location'), null);
});

test('GET /:key 遇到非法 key 仍重定向到首页', async () => {
    const response = await noteRoutes.request(`/${encodeURIComponent('bad key!')}`);

    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/');
});

test('子路由拒绝非法 key，且不写库', async () => {
    const env = createTestEnv({ DB: new MemoryD1() });
    const badKeys = [encodeURIComponent('bad key!'), 'x'.repeat(129), encodeURIComponent('a"b')];
    const requests = [
        ['auto-save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'hi' }) }],
        ['update', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'content=hi' }],
        ['verify', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'password=x' }],
        ['verify-delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"password":"x"}' }],
        ['verify-download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"password":"x"}' }],
        ['delete', { method: 'POST' }],
        ['download', { method: 'GET' }]
    ];

    for (const key of badKeys) {
        for (const [action, init] of requests) {
            const response = await noteRoutes.request(`/${key}/${action}`, init, env);
            assert.equal(response.status, 404, `${action} 应拒绝非法 key ${key}`);
        }
    }
    assert.equal(env.DB.notes.size, 0);
});

test('子路由对合法 key 正常放行', async () => {
    const env = createTestEnv({ DB: new MemoryD1() });
    const response = await noteRoutes.request('/valid_key-1/auto-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'hi' })
    }, env);

    assert.equal(response.status, 200);
    assert.ok(env.DB.notes.has('valid_key-1'));
});
