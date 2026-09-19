import type { Bindings } from '../types';

// dex OIDC 客户端（自建，不依赖 Auth.js）
//
// 2026-09-19 实测 https://auth.zkun.de/dex/.well-known/openid-configuration 的硬约束：
//   - 无 end_session_endpoint：不支持单点登出，"登出"只能清理本站会话，IdP 侧会话由 IdP 决定
//   - token_endpoint_auth_methods_supported 不含 none：必须使用机密客户端，client_secret 不可省
//   - code_challenge_methods_supported 含 S256：启用 PKCE(S256)
//   - iss = https://auth.zkun.de/dex（带 /dex 前缀），id_token 的 iss 必须按完整值比对
//   - id_token 签名算法仅 RS256，JWKS 存在多把密钥，必须按 kid 动态选取（支持轮换）

/**
 * dex 回调路径。dex 侧登记的 redirectURI 必须与之完全一致（不能用通配），
 * 修改此常量前必须先确认 dex 的 staticClients.redirectURIs 已同步。
 */
export const DEX_CALLBACK_PATH = '/admin/sso/callback';

/** 承载 state / nonce / PKCE verifier 的一次性签名 Cookie */
export const DEX_STATE_COOKIE = 'yonote_dex_state';

/** state Cookie 有效期（秒） */
const DEX_STATE_TTL = 600;

const DEX_SCOPES = 'openid profile email';
const DISCOVERY_TTL_MS = 10 * 60 * 1000;
const JWKS_TTL_MS = 10 * 60 * 1000;
const CLOCK_SKEW_SECONDS = 60;
const ALLOWED_SIGNING_ALGS = ['RS256'];
const STATE_COOKIE_VERSION = 'v1';

export interface DexConfig {
    issuer: string;
    clientId: string;
    clientSecret: string;
    /** 显式配置的回调地址；为空时按请求域名推导 */
    redirectUri: string | null;
    allowedSubs: string[];
    allowedUsers: string[];
    allowedEmails: string[];
}

export type DexConfigStatus = 'ready' | 'unconfigured' | 'incomplete-credentials' | 'missing-allowlist';

export interface DexIdentity {
    sub: string;
    username: string;
    email: string | null;
    emailVerified: boolean;
}

interface OidcDiscovery {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    jwks_uri: string;
    userinfo_endpoint?: string;
}

interface Jwk {
    kty: string;
    kid?: string;
    n?: string;
    e?: string;
    alg?: string;
    use?: string;
}

interface DexStatePayload {
    /** state */
    s: string;
    /** PKCE code_verifier */
    v: string;
    /** nonce */
    n: string;
    /** 本次使用的 redirect_uri */
    r: string;
    /** 签发时间（秒） */
    t: number;
}

export interface DexAuthRequest {
    url: string;
    stateCookie: string;
    maxAge: number;
}

let discoveryCache: { issuer: string; value: OidcDiscovery; expiresAt: number } | null = null;
let jwksCache: { uri: string; keys: Jwk[]; expiresAt: number } | null = null;

function splitList(value: string | undefined): string[] {
    return (value ?? '')
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function getAllowlist(env: Bindings): { subs: string[]; users: string[]; emails: string[] } {
    return {
        subs: splitList(env.DEX_ALLOWED_SUBS),
        users: splitList(env.DEX_ALLOWED_USERS).map((item) => item.toLowerCase()),
        emails: splitList(env.DEX_ALLOWED_EMAILS).map((item) => item.toLowerCase())
    };
}

// getDexConfigStatus 判定 dex 配置的完整度，用于后台提示与排障
//
// 参数:
//   - env Bindings: Worker 环境变量
//
// 元数据:
//   - 作者: VitaHuang
//   - 创建时间: 2026-09-19
//   - 更新时间: 2026-09-19
//   - 更新内容: 初始化 dex 配置完整度判定，区分「未配置」「凭据不全」「白名单为空」。
export function getDexConfigStatus(env: Bindings): DexConfigStatus {
    const issuer = env.DEX_ISSUER?.trim() ?? '';
    const clientId = env.DEX_CLIENT_ID?.trim() ?? '';
    const clientSecret = env.DEX_CLIENT_SECRET?.trim() ?? '';

    if (!issuer && !clientId && !clientSecret) {
        return 'unconfigured';
    }
    if (!issuer || !clientId || !clientSecret) {
        return 'incomplete-credentials';
    }

    const allowlist = getAllowlist(env);
    if (allowlist.subs.length + allowlist.users.length + allowlist.emails.length === 0) {
        return 'missing-allowlist';
    }

    return 'ready';
}

// getDexConfig 返回可直接使用的 dex 配置
//
// 参数:
//   - env Bindings: Worker 环境变量
//
// 元数据:
//   - 作者: VitaHuang
//   - 创建时间: 2026-09-19
//   - 更新时间: 2026-09-19
//   - 更新内容: 初始化 dex 配置解析；凭据不全或白名单为空时返回 null（入口不渲染）。
export function getDexConfig(env: Bindings): DexConfig | null {
    if (getDexConfigStatus(env) !== 'ready') {
        return null;
    }

    const allowlist = getAllowlist(env);
    const redirectUri = env.DEX_REDIRECT_URI?.trim();

    return {
        issuer: (env.DEX_ISSUER ?? '').trim().replace(/\/+$/, ''),
        clientId: (env.DEX_CLIENT_ID ?? '').trim(),
        clientSecret: (env.DEX_CLIENT_SECRET ?? '').trim(),
        redirectUri: redirectUri ? redirectUri : null,
        allowedSubs: allowlist.subs,
        allowedUsers: allowlist.users,
        allowedEmails: allowlist.emails
    };
}

// resolveRedirectUri 计算本次授权使用的回调地址
//
// 参数:
//   - requestUrl string: 当前请求 URL
//   - config DexConfig: dex 配置
//
// 元数据:
//   - 作者: VitaHuang
//   - 创建时间: 2026-09-19
//   - 更新时间: 2026-09-19
//   - 更新内容: 初始化回调地址推导；未显式配置时按请求域名 + DEX_CALLBACK_PATH 生成。
export function resolveRedirectUri(requestUrl: string, config: DexConfig): string {
    if (config.redirectUri) {
        return config.redirectUri;
    }
    return `${new URL(requestUrl).origin}${DEX_CALLBACK_PATH}`;
}

// isIdentityAllowed 判定 dex 身份是否在管理员白名单内
//
// 参数:
//   - config DexConfig: dex 配置
//   - identity DexIdentity: 已验签的 dex 身份
//
// 元数据:
//   - 作者: VitaHuang
//   - 创建时间: 2026-09-19
//   - 更新时间: 2026-09-19
//   - 更新内容: 初始化白名单判定；sub 优先且不可变，用户名/邮箱为首次接入的引导回退。
export function isIdentityAllowed(config: DexConfig, identity: DexIdentity): boolean {
    if (config.allowedSubs.includes(identity.sub)) {
        return true;
    }
    if (config.allowedUsers.includes(identity.username.toLowerCase())) {
        return true;
    }
    if (identity.emailVerified && identity.email && config.allowedEmails.includes(identity.email.toLowerCase())) {
        return true;
    }
    return false;
}

function base64UrlEncode(buffer: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < buffer.length; i++) {
        binary += String.fromCharCode(buffer[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string): Uint8Array {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function textBase64UrlEncode(value: string): string {
    return base64UrlEncode(new TextEncoder().encode(value));
}

function textBase64UrlDecode(value: string): string {
    return new TextDecoder().decode(base64UrlDecode(value));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a[i] ^ b[i];
    }
    return diff === 0;
}

async function signWithSecret(value: string, secret: string): Promise<Uint8Array> {
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
    return new Uint8Array(signature);
}

function randomToken(bytes: number): string {
    const buffer = new Uint8Array(bytes);
    crypto.getRandomValues(buffer);
    return base64UrlEncode(buffer);
}

async function createCodeChallenge(verifier: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return base64UrlEncode(new Uint8Array(digest));
}

async function getDiscovery(issuer: string): Promise<OidcDiscovery> {
    const now = Date.now();
    if (discoveryCache && discoveryCache.issuer === issuer && discoveryCache.expiresAt > now) {
        return discoveryCache.value;
    }

    const response = await fetch(`${issuer}/.well-known/openid-configuration`, {
        headers: { Accept: 'application/json' }
    });
    if (!response.ok) {
        throw new Error(`dex discovery 请求失败：HTTP ${response.status}`);
    }

    const document = await response.json<Partial<OidcDiscovery>>();
    if (!document.issuer || !document.authorization_endpoint || !document.token_endpoint || !document.jwks_uri) {
        throw new Error('dex discovery 文档缺少必要字段');
    }
    if (document.issuer.replace(/\/+$/, '') !== issuer) {
        throw new Error(`dex issuer 不匹配：${document.issuer}`);
    }

    const value: OidcDiscovery = {
        issuer: document.issuer,
        authorization_endpoint: document.authorization_endpoint,
        token_endpoint: document.token_endpoint,
        jwks_uri: document.jwks_uri,
        userinfo_endpoint: document.userinfo_endpoint
    };
    discoveryCache = { issuer, value, expiresAt: now + DISCOVERY_TTL_MS };
    return value;
}

async function getJwks(uri: string, forceRefresh = false): Promise<Jwk[]> {
    const now = Date.now();
    if (!forceRefresh && jwksCache && jwksCache.uri === uri && jwksCache.expiresAt > now) {
        return jwksCache.keys;
    }

    const response = await fetch(uri, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
        throw new Error(`dex JWKS 请求失败：HTTP ${response.status}`);
    }

    const document = await response.json<{ keys?: Jwk[] }>();
    const keys = Array.isArray(document.keys) ? document.keys : [];
    if (keys.length === 0) {
        throw new Error('dex JWKS 未返回可用密钥');
    }

    jwksCache = { uri, keys, expiresAt: now + JWKS_TTL_MS };
    return keys;
}

// createAuthorizeRequest 生成授权跳转所需的 URL 与 state Cookie
//
// 参数:
//   - env Bindings: Worker 环境变量
//   - requestUrl string: 当前请求 URL
//
// 元数据:
//   - 作者: VitaHuang
//   - 创建时间: 2026-09-19
//   - 更新时间: 2026-09-19
//   - 更新内容: 初始化授权请求构造，state/nonce/PKCE verifier 存入一次性签名 Cookie。
export async function createAuthorizeRequest(env: Bindings, requestUrl: string): Promise<DexAuthRequest> {
    const config = getDexConfig(env);
    if (!config) {
        throw new Error('dex 未配置');
    }
    const secret = env.AUTH_SECRET?.trim();
    if (!secret) {
        throw new Error('AUTH_SECRET 未配置');
    }

    const discovery = await getDiscovery(config.issuer);
    const redirectUri = resolveRedirectUri(requestUrl, config);

    const state = randomToken(32);
    const nonce = randomToken(32);
    const verifier = randomToken(48);
    const challenge = await createCodeChallenge(verifier);

    const payload: DexStatePayload = {
        s: state,
        v: verifier,
        n: nonce,
        r: redirectUri,
        t: Math.floor(Date.now() / 1000)
    };
    const encoded = textBase64UrlEncode(JSON.stringify(payload));
    const signature = base64UrlEncode(await signWithSecret(encoded, secret));

    const authorizeUrl = new URL(discovery.authorization_endpoint);
    authorizeUrl.searchParams.set('client_id', config.clientId);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('scope', DEX_SCOPES);
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('state', state);
    authorizeUrl.searchParams.set('nonce', nonce);
    authorizeUrl.searchParams.set('code_challenge', challenge);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');

    return {
        url: authorizeUrl.toString(),
        stateCookie: `${STATE_COOKIE_VERSION}.${encoded}.${signature}`,
        maxAge: DEX_STATE_TTL
    };
}

async function readStateCookie(value: string, secret: string): Promise<DexStatePayload | null> {
    const parts = value.split('.');
    if (parts.length !== 3 || parts[0] !== STATE_COOKIE_VERSION) {
        return null;
    }

    const payload = parts[1];
    const provided = base64UrlDecode(parts[2]);
    const expected = await signWithSecret(payload, secret);
    if (!timingSafeEqual(provided, expected)) {
        return null;
    }

    try {
        const parsed = JSON.parse(textBase64UrlDecode(payload)) as DexStatePayload;
        if (typeof parsed.t !== 'number' || Math.floor(Date.now() / 1000) - parsed.t > DEX_STATE_TTL) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

// matchesState 校验回调请求的 state 与 Cookie 中的 state
//
// 参数:
//   - stateCookie string | undefined: 浏览器回传的 state Cookie
//   - state string | undefined: 授权回调携带的 state 参数
//   - secret string: AUTH_SECRET
//
// 元数据:
//   - 作者: VitaHuang
//   - 创建时间: 2026-09-19
//   - 更新时间: 2026-09-19
//   - 更新内容: 初始化 state 校验，采用定时安全比较避免旁路泄漏。
export async function matchesState(
    stateCookie: string | undefined,
    state: string | undefined,
    secret: string
): Promise<boolean> {
    if (!stateCookie || !state) {
        return false;
    }
    const payload = await readStateCookie(stateCookie, secret);
    if (!payload) {
        return false;
    }
    return timingSafeEqual(new TextEncoder().encode(payload.s), new TextEncoder().encode(state));
}

async function exchangeCode(
    config: DexConfig,
    discovery: OidcDiscovery,
    code: string,
    verifier: string,
    redirectUri: string
): Promise<string> {
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code_verifier: verifier
    });

    const response = await fetch(discovery.token_endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json'
        },
        body: body.toString()
    });

    if (!response.ok) {
        throw new Error(`dex token 交换失败：HTTP ${response.status}`);
    }

    const tokens = await response.json<{ id_token?: string }>();
    if (!tokens.id_token) {
        throw new Error('dex token 响应缺少 id_token');
    }
    return tokens.id_token;
}

function decodeJwtPart(part: string): Record<string, unknown> {
    return JSON.parse(textBase64UrlDecode(part)) as Record<string, unknown>;
}

async function verifyIdToken(
    config: DexConfig,
    discovery: OidcDiscovery,
    idToken: string,
    expectedNonce: string
): Promise<DexIdentity> {
    const parts = idToken.split('.');
    if (parts.length !== 3) {
        throw new Error('id_token 格式不正确');
    }

    const header = decodeJwtPart(parts[0]);
    const claims = decodeJwtPart(parts[1]);
    const algorithm = typeof header.alg === 'string' ? header.alg : '';
    if (!ALLOWED_SIGNING_ALGS.includes(algorithm)) {
        throw new Error(`不支持的 id_token 签名算法：${algorithm}`);
    }

    const kid = typeof header.kid === 'string' ? header.kid : undefined;
    const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const signature = base64UrlDecode(parts[2]);

    // JWKS 存在多把密钥（可能轮换），kid 未命中时强制刷新一次
    let keys = await getJwks(discovery.jwks_uri);
    let candidates = kid ? keys.filter((key) => key.kid === kid) : keys;
    if (candidates.length === 0 && kid) {
        keys = await getJwks(discovery.jwks_uri, true);
        candidates = keys.filter((key) => key.kid === kid);
    }
    if (candidates.length === 0) {
        throw new Error('dex JWKS 中未找到匹配的签名密钥');
    }

    let verified = false;
    for (const candidate of candidates) {
        if (candidate.kty !== 'RSA' || !candidate.n || !candidate.e) {
            continue;
        }
        try {
            const key = await crypto.subtle.importKey(
                'jwk',
                { kty: 'RSA', n: candidate.n, e: candidate.e, alg: 'RS256', ext: true },
                { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
                false,
                ['verify']
            );
            verified = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signingInput);
        } catch {
            verified = false;
        }
        if (verified) {
            break;
        }
    }
    if (!verified) {
        throw new Error('id_token 签名校验失败');
    }

    const issuer = typeof claims.iss === 'string' ? claims.iss.replace(/\/+$/, '') : '';
    if (issuer !== config.issuer) {
        throw new Error(`id_token issuer 不匹配：${issuer}`);
    }

    const audience = claims.aud;
    const audienceMatches = Array.isArray(audience)
        ? audience.includes(config.clientId)
        : audience === config.clientId;
    if (!audienceMatches) {
        throw new Error('id_token audience 不匹配');
    }

    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_SECONDS < now) {
        throw new Error('id_token 已过期');
    }
    if (claims.nonce !== expectedNonce) {
        throw new Error('id_token nonce 不匹配');
    }

    const sub = typeof claims.sub === 'string' ? claims.sub : '';
    if (!sub) {
        throw new Error('id_token 缺少 sub');
    }

    const email = typeof claims.email === 'string' ? claims.email : null;
    const preferredUsername = typeof claims.preferred_username === 'string' ? claims.preferred_username : '';
    const name = typeof claims.name === 'string' ? claims.name : '';

    // 展示用用户名的回退链：preferred_username -> name -> 邮箱本地部分 -> sub 前缀
    const username = preferredUsername || name || (email ? email.split('@')[0] : '') || sub.slice(0, 12);

    return {
        sub,
        username,
        email,
        emailVerified: claims.email_verified === true
    };
}

// exchangeAndVerify 完成授权码交换并返回已验签的 dex 身份
//
// 参数:
//   - env Bindings: Worker 环境变量
//   - code string: 授权码
//   - stateCookie string | undefined: 浏览器回传的 state Cookie
//
// 元数据:
//   - 作者: VitaHuang
//   - 创建时间: 2026-09-19
//   - 更新时间: 2026-09-19
//   - 更新内容: 初始化授权码交换链路，内部完成 state/nonce/PKCE/签名/iss/aud/exp 全量校验。
export async function exchangeAndVerify(
    env: Bindings,
    code: string,
    stateCookie: string
): Promise<{ identity: DexIdentity; redirectUri: string }> {
    const config = getDexConfig(env);
    if (!config) {
        throw new Error('dex 未配置');
    }
    const secret = env.AUTH_SECRET?.trim();
    if (!secret) {
        throw new Error('AUTH_SECRET 未配置');
    }

    const payload = await readStateCookie(stateCookie, secret);
    if (!payload) {
        throw new Error('state Cookie 无效或已过期');
    }

    const discovery = await getDiscovery(config.issuer);
    const idToken = await exchangeCode(config, discovery, code, payload.v, payload.r);
    const identity = await verifyIdToken(config, discovery, idToken, payload.n);

    return { identity, redirectUri: payload.r };
}
