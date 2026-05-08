import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { AppEnv } from '../types';

const AUTH_COOKIE_NAME = 'yonote_auth';
const AUTH_COOKIE_MAX_AGE = 7 * 24 * 3600; // 7天滑动过期
const AUTH_COOKIE_VERSION = 'v1';
const AUTH_COOKIE_MAX_ENTRIES = 50;

interface AuthData {
    keys: Record<string, boolean | string>;
    order?: string[];
}

function pruneAuthData(data: AuthData, limit: number = AUTH_COOKIE_MAX_ENTRIES): AuthData {
    const entries = Array.isArray(data.order) ? data.order.filter((key) => key in data.keys) : [];
    for (const key of Object.keys(data.keys)) {
        if (!entries.includes(key)) {
            entries.push(key);
        }
    }
    while (entries.length > limit) {
        const oldest = entries.shift();
        if (oldest) {
            delete data.keys[oldest];
        }
    }
    data.order = entries;
    return data;
}

function touchAuthEntry(data: AuthData, key: string): void {
    if (!Array.isArray(data.order)) {
        data.order = [];
    }
    data.order = data.order.filter((entry) => entry !== key);
    data.order.push(key);
}

function base64Encode(buffer: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < buffer.length; i++) {
        binary += String.fromCharCode(buffer[i]);
    }
    return btoa(binary);
}

function base64Decode(str: string): Uint8Array {
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function base64UrlEncode(buffer: Uint8Array): string {
    return base64Encode(buffer).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(str: string): Uint8Array {
    const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(str.length / 4) * 4, '=');
    return base64Decode(padded);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a[i] ^ b[i];
    }
    return diff === 0;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
}

async function signValue(value: string, secret: string): Promise<Uint8Array> {
    const key = await importHmacKey(secret);
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
    return new Uint8Array(signature);
}

async function createNoteAuthToken(key: string, passwordHash: string, secret: string): Promise<string> {
    const signature = await signValue(`${key}:${passwordHash}`, secret);
    return base64UrlEncode(signature);
}

function getAuthSecret(c: Context<AppEnv>): string {
    const secret = c.env.AUTH_SECRET?.trim();
    if (!secret) {
        throw new Error('AUTH_SECRET 未配置');
    }
    return secret;
}

async function decodeAuthCookie(value: string | undefined, secret: string): Promise<AuthData> {
    if (!value) return { keys: {} };

    const parts = value.split('.');
    if (parts.length !== 3 || parts[0] !== AUTH_COOKIE_VERSION) {
        return { keys: {} };
    }

    const payload = parts[1];
    const providedSig = base64UrlDecode(parts[2]);
    const expectedSig = await signValue(payload, secret);

    if (!timingSafeEqual(providedSig, expectedSig)) {
        return { keys: {} };
    }

    try {
        const json = new TextDecoder().decode(base64UrlDecode(payload));
        return JSON.parse(json);
    } catch {
        return { keys: {} };
    }
}

async function encodeAuthCookie(data: AuthData, secret: string): Promise<string> {
    const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(data)));
    const signature = base64UrlEncode(await signValue(payload, secret));
    return `${AUTH_COOKIE_VERSION}.${payload}.${signature}`;
}

// isAuthenticated 校验 note 浏览器会话是否有效
//
// 参数:
//   - c Context<AppEnv>: Hono 请求上下文
//   - key string: note key
//   - passwordHash string | null | undefined: 当前 note 密码哈希，受保护 note 必传
//
// 元数据:
//   - 作者: VitaHuang
//   - 创建时间: 2026-05-08
//   - 更新时间: 2026-05-08
//   - 更新内容: 将受保护 note 的认证状态绑定到当前密码哈希，避免旧会话绕过新密码。
export async function isAuthenticated(c: Context<AppEnv>, key: string, passwordHash?: string | null): Promise<boolean> {
    const secret = getAuthSecret(c);
    const cookie = getCookie(c, AUTH_COOKIE_NAME);
    const data = await decodeAuthCookie(cookie, secret);
    const value = data.keys[key];

    if (!passwordHash) {
        return value === true || typeof value === 'string';
    }

    if (typeof value !== 'string') {
        return false;
    }

    return value === await createNoteAuthToken(key, passwordHash, secret);
}

export async function setAuthenticated(c: Context<AppEnv>, key: string, passwordHash?: string | null): Promise<void> {
    const secret = getAuthSecret(c);
    const cookie = getCookie(c, AUTH_COOKIE_NAME);
    const data = await decodeAuthCookie(cookie, secret);
    data.keys[key] = passwordHash
        ? await createNoteAuthToken(key, passwordHash, secret)
        : true;
    touchAuthEntry(data, key);
    pruneAuthData(data);

    setCookie(c, AUTH_COOKIE_NAME, await encodeAuthCookie(data, secret), {
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        maxAge: AUTH_COOKIE_MAX_AGE,
        path: '/'
    });
}

export async function removeAuthentication(c: Context<AppEnv>, key: string): Promise<void> {
    const secret = getAuthSecret(c);
    const cookie = getCookie(c, AUTH_COOKIE_NAME);
    const data = await decodeAuthCookie(cookie, secret);
    delete data.keys[key];
    if (Array.isArray(data.order)) {
        data.order = data.order.filter((entry) => entry !== key);
    }

    if (Object.keys(data.keys).length === 0) {
        deleteCookie(c, AUTH_COOKIE_NAME);
    } else {
        setCookie(c, AUTH_COOKIE_NAME, await encodeAuthCookie(data, secret), {
            httpOnly: true,
            secure: true,
            sameSite: 'Lax',
            maxAge: AUTH_COOKIE_MAX_AGE,
            path: '/'
        });
    }
}

export function requireAuth(key: string): MiddlewareHandler<AppEnv> {
    return async (c, next) => {
        if (!(await isAuthenticated(c, key))) {
            return c.redirect(`/${key}`);
        }
        await next();
    };
}
