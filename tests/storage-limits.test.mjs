import test from 'node:test';
import assert from 'node:assert/strict';

import { MemoryD1, createTestEnv } from './helpers/memory-d1.mjs';
import { SqliteD1 } from './helpers/sqlite-d1.mjs';
import { loadModule } from './helpers/load-module.mjs';

const { apiRoutes } = await loadModule('src/routes/api.ts');
const { noteRoutes } = await loadModule('src/routes/note.tsx');
const { NOTE_CREATE_LIMIT_MAX } = await loadModule('src/middleware/rateLimit.ts');
const entry = await loadModule('src/index.ts');

function exhaustCreateQuota(env, ip) {
    // 直接把该 IP 的新建配额打满，避免为测试真的发出 30 个请求而先撞上每分钟写入限流
    const resetAt = Math.floor(Date.now() / 1000) + 3600;
    env.DB.rateLimits.set(`${ip}:note:create`, { count: NOTE_CREATE_LIMIT_MAX, reset_at: resetAt });
}

test('API 新建笔记超出每 IP 配额时返回 429，已有笔记仍可更新', async () => {
    const env = createTestEnv({ DB: new MemoryD1() });
    env.DB.seedNote('existing-note', { content: 'old' });
    exhaustCreateQuota(env, '203.0.113.70');

    const post = (key) => apiRoutes.request(`/notes/${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.70' },
        body: JSON.stringify({ content: 'new' })
    }, env);

    const blocked = await post('brand-new-note');
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    assert.match((await blocked.json()).message, /新建笔记过于频繁/);
    assert.equal(env.DB.notes.has('brand-new-note'), false);

    const update = await post('existing-note');
    assert.equal(update.status, 200, '更新已有笔记不消耗新建配额');
});

test('网页 auto-save 与 update 新建笔记同样受配额限制', async () => {
    const env = createTestEnv({ DB: new MemoryD1() });
    exhaustCreateQuota(env, '203.0.113.71');
    const headers = { 'CF-Connecting-IP': '203.0.113.71' };

    const autoSave = await noteRoutes.request('/fresh-a/auto-save', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'hi' })
    }, env);
    assert.equal(autoSave.status, 429);

    const update = await noteRoutes.request('/fresh-b/update', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'content=hi'
    }, env);
    assert.equal(update.status, 302);
    assert.match(decodeURIComponent(update.headers.get('location')), /新建笔记过于频繁/);

    assert.equal(env.DB.notes.size, 0);
});

test('新建配额按 IP 隔离', async () => {
    const env = createTestEnv({ DB: new MemoryD1() });
    exhaustCreateQuota(env, '203.0.113.72');

    const response = await apiRoutes.request('/notes/other-ip-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.73' },
        body: JSON.stringify({ content: 'ok' })
    }, env);
    assert.equal(response.status, 200);
});

test('定时任务只清理过期的会话、锁定与限流记录', async () => {
    const db = new SqliteD1();
    const now = Math.floor(Date.now() / 1000);
    db.exec(`
        INSERT INTO admin_sessions (token, created_at, expires_at) VALUES
            ('expired', ${now - 100}, ${now - 1}),
            ('active', ${now}, ${now + 3600});
        INSERT INTO lockouts (ip, note_key, attempts, locked_until, created_at) VALUES
            ('1.1.1.1', 'lock-expired', 5, ${now - 1}, ${now - 4000}),
            ('1.1.1.1', 'lock-active', 5, ${now + 600}, ${now - 4000}),
            ('1.1.1.1', 'count-stale', 2, NULL, ${now - 4000}),
            ('1.1.1.1', 'count-fresh', 2, NULL, ${now - 60});
        INSERT INTO rate_limits (ip, bucket, count, reset_at) VALUES
            ('1.1.1.1', 'old', 3, ${now - 1}),
            ('1.1.1.1', 'current', 3, ${now + 60});
    `);

    const waits = [];
    entry.default.scheduled({}, createTestEnv({ DB: db }), { waitUntil: (promise) => waits.push(promise) });
    await Promise.all(waits);

    assert.deepEqual(db.rows('SELECT token FROM admin_sessions').map((row) => row.token), ['active']);
    assert.deepEqual(
        db.rows('SELECT note_key FROM lockouts ORDER BY note_key').map((row) => row.note_key),
        ['count-fresh', 'lock-active']
    );
    assert.deepEqual(db.rows('SELECT bucket FROM rate_limits').map((row) => row.bucket), ['current']);
});
