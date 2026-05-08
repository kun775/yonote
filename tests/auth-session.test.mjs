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
