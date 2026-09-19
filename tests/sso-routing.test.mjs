import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

import { MemoryD1 } from './helpers/memory-d1.mjs';

// 入口级冒烟：验证 /admin/sso/* 在真实 app（src/index.ts）里可达，
// 而不是只在子应用上可达（路由注册顺序问题在子应用测试里发现不了）。

async function loadApp() {
    const result = await build({
        entryPoints: ['src/index.ts'],
        bundle: true,
        format: 'esm',
        platform: 'node',
        target: 'es2022',
        write: false
    });

    const source = result.outputFiles[0].text;
    const encoded = Buffer.from(source).toString('base64');
    return (await import(`data:text/javascript;base64,${encoded}`)).default;
}

const app = await loadApp();

function createEnv(overrides = {}) {
    return {
        DB: new MemoryD1(),
        ENCRYPTION_KEY: 'routing-test-encryption',
        AUTH_SECRET: 'routing-test-auth-secret',
        ADMIN_PASSWORD: 'pbkdf2$100000$c2FsdA==$aGFzaA==',
        ENVIRONMENT: 'test',
        ...overrides
    };
}

test('入口可达：/admin/sso/start 未被 note 路由吞掉', async () => {
    const env = createEnv();
    const response = await app.request('/admin/sso/start', undefined, env);

    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/admin?error=sso_unavailable');
});

test('入口可达：/admin/sso/callback 未被 note 路由吞掉', async () => {
    // dex 未配置时先命中「入口不可用」
    const disabled = await app.request('/admin/sso/callback?code=x&state=y', undefined, createEnv());
    assert.equal(disabled.status, 302);
    assert.equal(disabled.headers.get('location'), '/admin?error=sso_unavailable');

    // dex 配置齐全、缺少 state Cookie 时应回到 state 校验失败
    const env = createEnv({
        DEX_ISSUER: 'https://auth.zkun.de/dex',
        DEX_CLIENT_ID: 'yonote',
        DEX_CLIENT_SECRET: 'test-client-secret',
        DEX_ALLOWED_USERS: 'dex_vita'
    });
    const response = await app.request('/admin/sso/callback?code=x&state=y', undefined, env);

    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/admin?error=sso_state');
});

test('dex 未配置时 /admin 不渲染单点登录按钮', async () => {
    const env = createEnv();
    const response = await app.request('/admin', undefined, env);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /name="password"/);
    assert.doesNotMatch(html, /\/admin\/sso\/start/);
});

test('dex 配置齐全时 /admin 同时渲染两个入口', async () => {
    const env = createEnv({
        DEX_ISSUER: 'https://auth.zkun.de/dex',
        DEX_CLIENT_ID: 'yonote',
        DEX_CLIENT_SECRET: 'test-client-secret',
        DEX_ALLOWED_USERS: 'dex_vita'
    });
    const response = await app.request('/admin', undefined, env);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /name="password"/);
    assert.match(html, /\/admin\/sso\/start/);
});

test('全部入口关闭时 POST /admin/login 返回 403', async () => {
    const env = createEnv({ PASSWORD_ENABLED: 'false' });
    const response = await app.request(
        '/admin/login',
        {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: 'password=whatever'
        },
        env
    );

    assert.equal(response.status, 403);
});
