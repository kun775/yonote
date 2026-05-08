import test from 'node:test';
import assert from 'node:assert/strict';

import { Hono } from 'hono';
import { isAuthenticated, setAuthenticated } from '../src/middleware/auth.ts';

const env = {
    AUTH_SECRET: 'auth-session-test-secret'
};

function getCookieValue(response) {
    const setCookie = response.headers.get('set-cookie');
    assert.ok(setCookie);
    return setCookie.split(';')[0];
}

test('未绑定密码哈希的旧 note cookie 不能认证受保护 note', async () => {
    const app = new Hono();

    app.get('/grant-open', async (c) => {
        await setAuthenticated(c, 'test-note');
        return c.text('ok');
    });

    app.get('/check-protected', async (c) => {
        const ok = await isAuthenticated(c, 'test-note', 'password-hash-v1');
        return c.json({ ok });
    });

    const grantResponse = await app.request('/grant-open', undefined, env);
    const cookie = getCookieValue(grantResponse);

    const checkResponse = await app.request('/check-protected', {
        headers: { Cookie: cookie }
    }, env);
    const body = await checkResponse.json();

    assert.equal(body.ok, false);
});

test('受保护 note cookie 只对当前密码哈希有效', async () => {
    const app = new Hono();

    app.get('/grant-protected', async (c) => {
        await setAuthenticated(c, 'test-note', 'password-hash-v1');
        return c.text('ok');
    });

    app.get('/check-current', async (c) => {
        const ok = await isAuthenticated(c, 'test-note', 'password-hash-v1');
        return c.json({ ok });
    });

    app.get('/check-changed', async (c) => {
        const ok = await isAuthenticated(c, 'test-note', 'password-hash-v2');
        return c.json({ ok });
    });

    const grantResponse = await app.request('/grant-protected', undefined, env);
    const cookie = getCookieValue(grantResponse);

    const currentResponse = await app.request('/check-current', {
        headers: { Cookie: cookie }
    }, env);
    const changedResponse = await app.request('/check-changed', {
        headers: { Cookie: cookie }
    }, env);

    assert.equal((await currentResponse.json()).ok, true);
    assert.equal((await changedResponse.json()).ok, false);
});

test('auth cookie 条目数量超过上限时按 LRU 淘汰最旧 key', async () => {
    const app = new Hono();

    app.get('/grant/:key', async (c) => {
        await setAuthenticated(c, c.req.param('key'));
        return c.text('ok');
    });

    app.get('/check/:key', async (c) => {
        const ok = await isAuthenticated(c, c.req.param('key'));
        return c.json({ ok });
    });

    // 累积超过 AUTH_COOKIE_MAX_ENTRIES (50) 个条目，并把 key-0 留在最旧位置
    let cookie = '';
    for (let i = 0; i < 60; i++) {
        const res = await app.request(`/grant/key-${i}`, {
            headers: cookie ? { Cookie: cookie } : undefined
        }, env);
        const setCookie = res.headers.get('set-cookie');
        assert.ok(setCookie);
        cookie = setCookie.split(';')[0];
    }

    const oldest = await app.request('/check/key-0', {
        headers: { Cookie: cookie }
    }, env);
    const newest = await app.request('/check/key-59', {
        headers: { Cookie: cookie }
    }, env);

    assert.equal((await oldest.json()).ok, false, '最旧 key 应被 LRU 淘汰');
    assert.equal((await newest.json()).ok, true, '最新 key 仍应有效');
});
