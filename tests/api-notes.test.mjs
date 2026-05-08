import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

import { verifyPassword } from '../src/services/crypto.ts';
import { MemoryD1 } from './helpers/memory-d1.mjs';

async function loadApiRoutes() {
    const result = await build({
        entryPoints: ['src/routes/api.ts'],
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

const { apiRoutes } = await loadApiRoutes();

function createEnv() {
    return {
        DB: new MemoryD1(),
        ENCRYPTION_KEY: 'api-notes-test-secret',
        AUTH_SECRET: 'api-notes-auth-secret',
        ADMIN_PASSWORD: 'unused',
        ENVIRONMENT: 'test'
    };
}

async function requestJson(env, path, init = {}) {
    const response = await apiRoutes.request(path, init, env);
    const body = await response.json();
    return { response, body };
}

async function legacySha256(password) {
    const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
    return Array.from(new Uint8Array(buffer))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

test('GET /notes/:key 读取不存在的 note 时返回 404', async () => {
    const env = createEnv();

    const { response, body } = await requestJson(env, '/notes/missing-note');

    assert.equal(response.status, 404);
    assert.equal(body.status, 'error');
    assert.equal(body.message, '笔记不存在');
});

test('POST /notes/:key 默认覆盖写入，append 为 true 时追加写入', async () => {
    const env = createEnv();

    const created = await requestJson(env, '/notes/api-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '第一行' })
    });
    assert.equal(created.response.status, 200);
    assert.equal(created.body.status, 'success');

    const appended = await requestJson(env, '/notes/api-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '\n第二行', append: true })
    });
    assert.equal(appended.response.status, 200);

    const read = await requestJson(env, '/notes/api-note');
    assert.equal(read.response.status, 200);
    assert.equal(read.body.note.content, '第一行\n第二行');
    assert.equal(Object.hasOwn(read.body, 'content'), false);

    await requestJson(env, '/notes/api-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '覆盖内容' })
    });

    const overwritten = await requestJson(env, '/notes/api-note');
    assert.equal(overwritten.body.note.content, '覆盖内容');
});

test('POST /notes/:key 创建私有保护 note 后读写都需要 x-admin-auth', async () => {
    const env = createEnv();

    const created = await requestJson(env, '/notes/protected-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '私有内容', password: 'secret' })
    });
    assert.equal(created.response.status, 200);

    const rejectedRead = await requestJson(env, '/notes/protected-note');
    assert.equal(rejectedRead.response.status, 403);

    const acceptedRead = await requestJson(env, '/notes/protected-note', {
        headers: { 'x-admin-auth': 'secret' }
    });
    assert.equal(acceptedRead.response.status, 200);
    assert.equal(acceptedRead.body.note.content, '私有内容');

    const rejectedWrite = await requestJson(env, '/notes/protected-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '非法覆盖' })
    });
    assert.equal(rejectedWrite.response.status, 403);

    const acceptedWrite = await requestJson(env, '/notes/protected-note', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-admin-auth': 'secret'
        },
        body: JSON.stringify({ content: '合法覆盖' })
    });
    assert.equal(acceptedWrite.response.status, 200);
});

test('public 为 true 的保护 note 可公开读取，但编辑仍需要 x-admin-auth', async () => {
    const env = createEnv();

    await requestJson(env, '/notes/public-protected-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '公开内容', password: 'secret', public: true })
    });

    const publicRead = await requestJson(env, '/notes/public-protected-note');
    assert.equal(publicRead.response.status, 200);
    assert.equal(publicRead.body.note.content, '公开内容');
    assert.equal(publicRead.body.note.public, true);
    assert.equal(publicRead.body.note.hasPassword, true);

    const rejectedWrite = await requestJson(env, '/notes/public-protected-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '非法编辑' })
    });
    assert.equal(rejectedWrite.response.status, 403);

    const acceptedWrite = await requestJson(env, '/notes/public-protected-note', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-admin-auth': 'secret'
        },
        body: JSON.stringify({ content: '追加内容', append: true })
    });
    assert.equal(acceptedWrite.response.status, 200);

    const updatedRead = await requestJson(env, '/notes/public-protected-note');
    assert.equal(updatedRead.body.note.content, '公开内容追加内容');
});

test('POST /notes/:key 可为已有 note 设置密码保护', async () => {
    const env = createEnv();

    await requestJson(env, '/notes/plain-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '普通内容' })
    });

    await requestJson(env, '/notes/plain-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '加密保护内容', password: 'secret', public: true })
    });

    const note = env.DB.notes.get('plain-note');
    assert.equal(note.public, 1);
    assert.equal(await verifyPassword('secret', note.password), true);

    const read = await requestJson(env, '/notes/plain-note');
    assert.equal(read.response.status, 200);
    assert.equal(read.body.note.hasPassword, true);
});

test('POST /notes/:key 提交相同 password 时保留原密码哈希', async () => {
    const env = createEnv();

    await requestJson(env, '/notes/same-password-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '初始内容', password: 'secret' })
    });

    const firstHash = env.DB.notes.get('same-password-note').password;

    const response = await requestJson(env, '/notes/same-password-note', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-admin-auth': 'secret'
        },
        body: JSON.stringify({ content: '更新内容', password: 'secret' })
    });

    assert.equal(response.response.status, 200);
    assert.equal(env.DB.notes.get('same-password-note').password, firstHash);
});

test('API 密码连续错误后触发锁定', async () => {
    const env = createEnv();

    await requestJson(env, '/notes/lockout-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '私有内容', password: 'secret' })
    });

    for (let i = 0; i < 4; i++) {
        const failed = await requestJson(env, '/notes/lockout-note', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-auth': 'wrong'
            },
            body: JSON.stringify({ content: '非法覆盖' })
        });
        assert.equal(failed.response.status, 403);
    }

    const locked = await requestJson(env, '/notes/lockout-note', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-admin-auth': 'wrong'
        },
        body: JSON.stringify({ content: '非法覆盖' })
    });

    assert.equal(locked.response.status, 429);
    assert.match(locked.body.message, /多次密码错误|稍后/);
});

test('API 成功验证 legacy 密码后升级为 PBKDF2 哈希', async () => {
    const env = createEnv();
    const now = Math.floor(Date.now() / 1000);
    env.DB.notes.set('legacy-note', {
        id: env.DB.nextId++,
        key: 'legacy-note',
        content: 'legacy-content',
        password: await legacySha256('secret'),
        public: 0,
        encrypted: 0,
        created_at: now,
        updated_at: now
    });

    const response = await requestJson(env, '/notes/legacy-note', {
        headers: { 'x-admin-auth': 'secret' }
    });

    assert.equal(response.response.status, 200);
    assert.match(env.DB.notes.get('legacy-note').password, /^pbkdf2\$/);
});
