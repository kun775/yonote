import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

import { hashPassword, verifyPassword } from '../src/services/crypto.ts';
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

function createEnv() {
    return createTestEnv({ DB: new MemoryD1() });
}

function seedProtectedNote(env, key, password, overrides = {}) {
    return hashPassword(password).then((hash) => env.DB.seedNote(key, {
        password: hash,
        public: 0,
        encrypted: 0,
        content: overrides.content || 'existing-plain',
        ...overrides
    }));
}

async function postUpdate(env, key, formFields, headers = {}) {
    const body = new URLSearchParams();
    for (const [name, value] of Object.entries(formFields)) {
        body.append(name, value);
    }

    return noteRoutes.request(`/${key}/update`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'CF-Connecting-IP': '198.51.100.17',
            ...headers
        },
        body: body.toString()
    }, env);
}

async function verifyAndGetAuthCookie(env, key, password) {
    const body = new URLSearchParams({ password, next_url: `/${key}` });
    const response = await noteRoutes.request(`/${key}/verify`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'CF-Connecting-IP': '198.51.100.17'
        },
        body: body.toString()
    }, env);

    const setCookie = response.headers.get('set-cookie');
    assert.ok(setCookie, '密码验证成功后必须下发 auth cookie');
    return setCookie.split(';')[0];
}

test('未认证用户更新受保护笔记时被重定向回笔记页，不落库', async () => {
    const env = createEnv();
    await seedProtectedNote(env, 'note-a', 'secret-v1');
    const originalHash = env.DB.notes.get('note-a').password;

    const response = await postUpdate(env, 'note-a', {
        content: '恶意覆盖',
        password_action: 'keep'
    });

    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/note-a');
    const note = env.DB.notes.get('note-a');
    assert.equal(note.content, 'existing-plain');
    assert.equal(note.password, originalHash);
});

test('移除密码要求当前密码正确，成功后 password 变 null、public 强制为 0', async () => {
    const env = createEnv();
    await seedProtectedNote(env, 'note-b', 'current-pass', { public: 1 });
    const cookie = await verifyAndGetAuthCookie(env, 'note-b', 'current-pass');

    const response = await postUpdate(env, 'note-b', {
        content: '正常内容',
        password_action: 'remove',
        current_password: 'current-pass',
        public: 'on'
    }, { Cookie: cookie });

    assert.equal(response.status, 302);
    const note = env.DB.notes.get('note-b');
    assert.equal(note.password, null);
    assert.equal(note.public, 0);
});

test('当前密码错误触发失败计数，笔记不被修改', async () => {
    const env = createEnv();
    await seedProtectedNote(env, 'note-c', 'real-pass');
    const cookie = await verifyAndGetAuthCookie(env, 'note-c', 'real-pass');
    const originalHash = env.DB.notes.get('note-c').password;

    const response = await postUpdate(env, 'note-c', {
        content: '新内容',
        password_action: 'change',
        current_password: 'wrong',
        new_password: 'whatever'
    }, { Cookie: cookie });

    assert.equal(response.status, 302);
    const location = response.headers.get('location') || '';
    assert.match(location, /error=/);
    const note = env.DB.notes.get('note-c');
    assert.equal(note.password, originalHash, '密码错误不得替换密码哈希');
    assert.equal(note.content, 'existing-plain', '密码错误不得修改内容');
});

test('首次给公开笔记设置密码后落库为 PBKDF2 哈希，public 按表单决定', async () => {
    const env = createEnv();
    env.DB.seedNote('note-d', { content: '公开可写', password: null, public: 0 });

    const response = await postUpdate(env, 'note-d', {
        content: '公开可写',
        password_action: 'change',
        new_password: 'brand-new',
        public: 'on'
    });

    assert.equal(response.status, 302);
    const note = env.DB.notes.get('note-d');
    assert.ok(note.password, '应写入密码哈希');
    assert.match(note.password, /^pbkdf2\$/);
    assert.equal(await verifyPassword('brand-new', note.password), true);
    assert.equal(note.public, 1);
});

test('内容超出 MAX_NOTE_CONTENT_BYTES 的 update 请求不落库', async () => {
    const { MAX_NOTE_CONTENT_BYTES } = await (await import('./helpers/load-module.mjs')).loadModule('src/middleware/rateLimit.ts');
    const env = createEnv();
    env.DB.seedNote('note-e', { content: 'original', password: null, public: 0 });
    const oversized = 'a'.repeat(MAX_NOTE_CONTENT_BYTES + 1);

    const response = await postUpdate(env, 'note-e', {
        content: oversized,
        password_action: 'keep'
    });

    assert.equal(response.status, 302);
    const location = response.headers.get('location') || '';
    assert.match(location, /error=/);
    const note = env.DB.notes.get('note-e');
    assert.equal(note.content, 'original');
});
