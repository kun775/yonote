import test from 'node:test';
import assert from 'node:assert/strict';

import { MemoryD1, createTestEnv } from './helpers/memory-d1.mjs';
import { loadModule } from './helpers/load-module.mjs';

const { apiRoutes } = await loadModule('src/routes/api.ts');
const { MAX_NOTE_CONTENT_BYTES, WRITE_RATE_LIMIT_MAX } = await loadModule('src/middleware/rateLimit.ts');

function createEnv() {
    return createTestEnv({ DB: new MemoryD1() });
}

async function postNote(env, key, payload, headers = {}) {
    return apiRoutes.request(`/notes/${key}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '198.51.100.42',
            ...headers
        },
        body: JSON.stringify(payload)
    }, env);
}

test('POST /notes/:key 超过 MAX_NOTE_CONTENT_BYTES 时返回 413', async () => {
    const env = createEnv();
    const oversized = 'a'.repeat(MAX_NOTE_CONTENT_BYTES + 1);

    const response = await postNote(env, 'too-big', { content: oversized });
    const body = await response.json();

    assert.equal(response.status, 413);
    assert.equal(body.status, 'error');
    assert.match(body.message, /超出上限/);
    assert.equal(env.DB.notes.has('too-big'), false);
});

test('POST /notes/:key 相同 IP 超过 WRITE_RATE_LIMIT_MAX 次时返回 429 并带 Retry-After', async () => {
    const env = createEnv();

    for (let i = 0; i < WRITE_RATE_LIMIT_MAX; i++) {
        const response = await postNote(env, `bucket-${i}`, { content: 'ok' });
        assert.equal(response.status, 200, `第 ${i + 1} 次写入应成功`);
    }

    const limited = await postNote(env, 'bucket-overflow', { content: 'ok' });
    assert.equal(limited.status, 429);

    const retryAfter = limited.headers.get('retry-after');
    assert.ok(retryAfter);
    assert.ok(Number(retryAfter) > 0);

    const body = await limited.json();
    assert.match(body.message, /过于频繁/);
});

test('POST /notes/:key 没有 CF-Connecting-IP 时跳过限流（兼容本地/非 CF 环境）', async () => {
    const env = createEnv();

    for (let i = 0; i < WRITE_RATE_LIMIT_MAX + 5; i++) {
        const response = await apiRoutes.request(`/notes/no-ip-${i}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: 'ok' })
        }, env);
        assert.equal(response.status, 200);
    }
});

test('不同 IP 的写入限流计数互相独立', async () => {
    const env = createEnv();

    for (let i = 0; i < WRITE_RATE_LIMIT_MAX; i++) {
        const res = await postNote(env, `ip-a-${i}`, { content: 'ok' }, { 'CF-Connecting-IP': '203.0.113.1' });
        assert.equal(res.status, 200);
    }

    const limitedA = await postNote(env, 'ip-a-extra', { content: 'ok' }, { 'CF-Connecting-IP': '203.0.113.1' });
    assert.equal(limitedA.status, 429);

    const okB = await postNote(env, 'ip-b-first', { content: 'ok' }, { 'CF-Connecting-IP': '203.0.113.2' });
    assert.equal(okB.status, 200);
});
