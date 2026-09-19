import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { build } from 'esbuild';

import { MemoryD1 } from './helpers/memory-d1.mjs';

async function loadAdminRoutes() {
    const result = await build({
        entryPoints: ['src/routes/admin.tsx'],
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

// 直接引用源码常量：路径被「顺手改整齐」时这里会先失败，而不是等到线上登录失效
const { DEX_CALLBACK_PATH } = await import('../src/services/dex.ts');
const { adminRoutes } = await loadAdminRoutes();

const ISSUER = 'https://auth.zkun.de/dex';
const DISCOVERY = {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/auth`,
    token_endpoint: `${ISSUER}/token`,
    jwks_uri: `${ISSUER}/keys`,
    userinfo_endpoint: `${ISSUER}/userinfo`
};
const KID = 'test-key-1';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = publicKey.export({ format: 'jwk' });

let nextIdToken = null;

function signIdToken(claims) {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const header = encode({ alg: 'RS256', typ: 'JWT', kid: KID });
    const payload = encode(claims);
    const signingInput = `${header}.${payload}`;
    const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url');
    return `${signingInput}.${signature}`;
}

// 伪造 dex：discovery / JWKS / token 三个端点，签名用测试私钥
function installDexStub() {
    const calls = [];
    globalThis.fetch = async (input) => {
        const url = typeof input === 'string' ? input : input.url;
        calls.push(url);

        if (url === `${ISSUER}/.well-known/openid-configuration`) {
            return Response.json(DISCOVERY);
        }
        if (url === DISCOVERY.jwks_uri) {
            return Response.json({ keys: [{ ...publicJwk, kid: KID, alg: 'RS256', use: 'sig' }] });
        }
        if (url === DISCOVERY.token_endpoint) {
            return Response.json({ id_token: nextIdToken });
        }
        return new Response('unexpected', { status: 404 });
    };
    return calls;
}

const dexCalls = installDexStub();

const DEX_ENV = {
    DEX_ISSUER: ISSUER,
    DEX_CLIENT_ID: 'yonote',
    DEX_CLIENT_SECRET: 'test-client-secret',
    DEX_ALLOWED_USERS: 'dex_vita',
    DEX_ALLOWED_EMAILS: 'vita@zkun.de'
};

function createEnv(overrides = {}) {
    return {
        DB: new MemoryD1(),
        ENCRYPTION_KEY: 'sso-test-encryption',
        AUTH_SECRET: 'sso-test-auth-secret',
        ADMIN_PASSWORD: 'pbkdf2$100000$c2FsdA==$aGFzaA==',
        ENVIRONMENT: 'test',
        ...overrides
    };
}

function seedSession(env, token, ttlSeconds = 3600) {
    const now = Math.floor(Date.now() / 1000);
    env.DB.adminSessions.set(token, {
        id: 1,
        token,
        created_at: now,
        expires_at: now + ttlSeconds
    });
}

async function renderLogin(env) {
    const response = await adminRoutes.request('/', undefined, env);
    assert.equal(response.status, 200);
    return response.text();
}

async function startAuthRequest(env) {
    const response = await adminRoutes.request('/sso/start', undefined, env);
    const location = response.headers.get('location');
    const cookies = response.headers.getSetCookie();
    const stateCookie = cookies.find((cookie) => cookie.startsWith('yonote_dex_state='));
    return { response, location, cookies, stateCookie: stateCookie ? stateCookie.split(';')[0] : null };
}

function buildIdTokenClaims(nonce, overrides = {}) {
    return {
        iss: ISSUER,
        aud: 'yonote',
        sub: 'dex-sub-0001',
        preferred_username: 'dex_vita',
        email: 'vita@zkun.de',
        email_verified: true,
        exp: Math.floor(Date.now() / 1000) + 300,
        iat: Math.floor(Date.now() / 1000),
        nonce,
        ...overrides
    };
}

test('dex 回调路径常量与 dex 侧登记保持一致', () => {
    assert.equal(DEX_CALLBACK_PATH, '/admin/sso/callback');
});

test('两个入口都关闭时禁止登录', async () => {
    const env = createEnv({ PASSWORD_ENABLED: 'false' });

    const html = await renderLogin(env);
    assert.match(html, /当前不可登录/);
    assert.doesNotMatch(html, /name="password"/);
    assert.doesNotMatch(html, /\/admin\/sso\/start/);

    const response = await adminRoutes.request(
        '/login',
        {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: 'password=whatever'
        },
        env
    );
    assert.equal(response.status, 403);

    const start = await adminRoutes.request('/sso/start', undefined, env);
    assert.equal(start.headers.get('location'), '/admin?error=sso_unavailable');
});

test('仅 dex 可用时只渲染单点登录入口', async () => {
    const env = createEnv({ PASSWORD_ENABLED: 'false', ...DEX_ENV });

    const html = await renderLogin(env);
    assert.doesNotMatch(html, /name="password"/);
    assert.match(html, /\/admin\/sso\/start/);
});

test('两个入口都开启时同时渲染', async () => {
    const env = createEnv({ PASSWORD_ENABLED: 'true', ...DEX_ENV });

    const html = await renderLogin(env);
    assert.match(html, /name="password"/);
    assert.match(html, /\/admin\/sso\/start/);
});

test('PASSWORD_ENABLED 缺省时保持既有行为（密码入口可用）', async () => {
    const env = createEnv();
    const html = await renderLogin(env);
    assert.match(html, /name="password"/);
});

test('首次部署（未配置管理密码）时给出 /admin/setup 引导而不是空表单', async () => {
    const env = createEnv({ ADMIN_PASSWORD: '' });
    const html = await renderLogin(env);

    assert.match(html, /当前不可登录/);
    assert.doesNotMatch(html, /name="password"/);
    assert.match(html, /\/admin\/setup/);
});

test('dex 未配置时不渲染入口且 /start 回到 sso_unavailable', async () => {
    const env = createEnv();

    const html = await renderLogin(env);
    assert.doesNotMatch(html, /\/admin\/sso\/start/);

    const { location } = await startAuthRequest(env);
    assert.equal(location, '/admin?error=sso_unavailable');
});

test('dex 白名单为空时按未启用处理', async () => {
    const env = createEnv({ DEX_ISSUER: ISSUER, DEX_CLIENT_ID: 'yonote', DEX_CLIENT_SECRET: 'secret' });

    const html = await renderLogin(env);
    assert.doesNotMatch(html, /\/admin\/sso\/start/);
});

test('授权跳转携带 state/nonce/PKCE 并下发一次性 Lax Cookie', async () => {
    const env = createEnv({ ...DEX_ENV });
    const { response, location, stateCookie, cookies } = await startAuthRequest(env);

    assert.equal(response.status, 302);
    assert.ok(location.startsWith(`${ISSUER}/auth?`));

    const url = new URL(location);
    assert.equal(url.searchParams.get('client_id'), 'yonote');
    assert.equal(url.searchParams.get('response_type'), 'code');
    assert.equal(url.searchParams.get('scope'), 'openid profile email');
    assert.equal(url.searchParams.get('redirect_uri'), `http://localhost${DEX_CALLBACK_PATH}`);
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(url.searchParams.get('state'));
    assert.ok(url.searchParams.get('nonce'));
    assert.ok(url.searchParams.get('code_challenge'));
    // 不申请 offline_access
    assert.doesNotMatch(url.searchParams.get('scope'), /offline_access/);

    const stateHeader = cookies.find((cookie) => cookie.startsWith('yonote_dex_state='));
    assert.ok(stateCookie);
    assert.match(stateHeader, /HttpOnly/i);
    assert.match(stateHeader, /SameSite=Lax/i);
    assert.match(stateHeader, /Path=\/admin/i);

    // discovery / JWKS / token 端点均来自 discovery 文档
    assert.ok(dexCalls.includes(`${ISSUER}/.well-known/openid-configuration`));
});

test('完整回调链路：验签通过后建立 dex 会话', async () => {
    const env = createEnv({ ...DEX_ENV });
    const { location, stateCookie } = await startAuthRequest(env);
    const authorizeUrl = new URL(location);
    const state = authorizeUrl.searchParams.get('state');

    nextIdToken = signIdToken(buildIdTokenClaims(authorizeUrl.searchParams.get('nonce')));

    const callback = await adminRoutes.request(
        `/sso/callback?code=test-code&state=${encodeURIComponent(state)}`,
        { headers: { cookie: stateCookie } },
        env
    );

    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get('location'), '/admin/dashboard');

    const cookies = callback.headers.getSetCookie();
    const adminCookie = cookies.find((cookie) => cookie.startsWith('yonote_admin='));
    assert.ok(adminCookie, '应下发管理员会话 Cookie');
    assert.match(adminCookie, /^yonote_admin=d\./, '会话令牌应标记 dex 来源');
    assert.match(adminCookie, /Path=\/admin/i);
    // 回归保护：SSO 回调与随后的 /admin/dashboard 同属一条由 IdP 发起的跨站重定向链，
    // SameSite=Strict 会让刚下发的会话 Cookie 在下一跳不携带（授权成功却退回登录页）。
    assert.match(adminCookie, /SameSite=Lax/i, '会话 Cookie 必须为 SameSite=Lax，Strict 会破坏 SSO 回跳');
    assert.match(adminCookie, /HttpOnly/i);
    assert.match(adminCookie, /Secure/i);

    // 一次性 state Cookie 必须被清除
    const cleared = cookies.find((cookie) => cookie.startsWith('yonote_dex_state='));
    assert.ok(cleared, '应清除 state Cookie');
    assert.match(cleared, /Max-Age=0/i);

    const sessionCookie = adminCookie.split(';')[0];
    assert.ok(env.DB.adminSessions.has(sessionCookie.slice('yonote_admin='.length)));

    const dashboard = await adminRoutes.request('/dashboard', { headers: { cookie: sessionCookie } }, env);
    assert.equal(dashboard.status, 200);
});

test('nonce 不匹配时登录失败', async () => {
    const env = createEnv({ ...DEX_ENV });
    const { location, stateCookie } = await startAuthRequest(env);
    const authorizeUrl = new URL(location);
    const state = authorizeUrl.searchParams.get('state');

    nextIdToken = signIdToken(buildIdTokenClaims('wrong-nonce'));

    const callback = await adminRoutes.request(
        `/sso/callback?code=test-code&state=${encodeURIComponent(state)}`,
        { headers: { cookie: stateCookie } },
        env
    );

    assert.equal(callback.headers.get('location'), '/admin?error=sso_failed');
    assert.equal(env.DB.adminSessions.size, 0);
});

test('不在白名单的账号被拒绝', async () => {
    const env = createEnv({ ...DEX_ENV, DEX_ALLOWED_USERS: 'someone_else', DEX_ALLOWED_EMAILS: '' });
    const { location, stateCookie } = await startAuthRequest(env);
    const authorizeUrl = new URL(location);

    nextIdToken = signIdToken(buildIdTokenClaims(authorizeUrl.searchParams.get('nonce')));

    const callback = await adminRoutes.request(
        `/sso/callback?code=test-code&state=${encodeURIComponent(authorizeUrl.searchParams.get('state'))}`,
        { headers: { cookie: stateCookie } },
        env
    );

    assert.equal(callback.headers.get('location'), '/admin?error=sso_forbidden');
    assert.equal(env.DB.adminSessions.size, 0);
});

test('邮箱白名单仅在 email_verified 为真时生效', async () => {
    const env = createEnv({ ...DEX_ENV, DEX_ALLOWED_USERS: '' });
    const { location, stateCookie } = await startAuthRequest(env);
    const authorizeUrl = new URL(location);

    nextIdToken = signIdToken(
        buildIdTokenClaims(authorizeUrl.searchParams.get('nonce'), {
            preferred_username: 'another-user',
            email_verified: false
        })
    );

    const callback = await adminRoutes.request(
        `/sso/callback?code=test-code&state=${encodeURIComponent(authorizeUrl.searchParams.get('state'))}`,
        { headers: { cookie: stateCookie } },
        env
    );

    assert.equal(callback.headers.get('location'), '/admin?error=sso_forbidden');
});

test('state 缺失或不匹配时回到 sso_state', async () => {
    const env = createEnv({ ...DEX_ENV });

    const withoutCookie = await adminRoutes.request('/sso/callback?code=x&state=p', undefined, env);
    assert.equal(withoutCookie.headers.get('location'), '/admin?error=sso_state');

    const { stateCookie } = await startAuthRequest(env);
    const mismatch = await adminRoutes.request(
        '/sso/callback?code=x&state=forged',
        { headers: { cookie: stateCookie } },
        env
    );
    assert.equal(mismatch.headers.get('location'), '/admin?error=sso_state');
    assert.match(
        mismatch.headers.getSetCookie().find((cookie) => cookie.startsWith('yonote_dex_state=')) ?? '',
        /Max-Age=0/i
    );
});

test('旧格式会话令牌按密码会话兼容，密码入口关闭后失效', async () => {
    const enabled = createEnv();
    seedSession(enabled, 'legacy-token-value');

    const allowed = await adminRoutes.request(
        '/dashboard',
        { headers: { cookie: 'yonote_admin=legacy-token-value' } },
        enabled
    );
    assert.equal(allowed.status, 200);

    const disabled = createEnv({ PASSWORD_ENABLED: 'false' });
    seedSession(disabled, 'legacy-token-value');

    const rejected = await adminRoutes.request(
        '/dashboard',
        { headers: { cookie: 'yonote_admin=legacy-token-value' } },
        disabled
    );
    assert.equal(rejected.status, 302);
    assert.equal(rejected.headers.get('location'), '/admin');
});

test('dex 入口关闭后 dex 会话失效', async () => {
    const enabled = createEnv({ ...DEX_ENV });
    seedSession(enabled, 'd.session-token-value');

    const allowed = await adminRoutes.request(
        '/dashboard',
        { headers: { cookie: 'yonote_admin=d.session-token-value' } },
        enabled
    );
    assert.equal(allowed.status, 200);

    const disabled = createEnv({ DEX_ISSUER: ISSUER, DEX_CLIENT_ID: 'yonote' });
    seedSession(disabled, 'd.session-token-value');

    const rejected = await adminRoutes.request(
        '/dashboard',
        { headers: { cookie: 'yonote_admin=d.session-token-value' } },
        disabled
    );
    assert.equal(rejected.status, 302);
    assert.equal(rejected.headers.get('location'), '/admin');
});
