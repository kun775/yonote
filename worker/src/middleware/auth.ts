import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { AppEnv } from '../types';

const AUTH_COOKIE_NAME = 'yonote_auth';
const AUTH_COOKIE_MAX_AGE = 3600;
const AUTH_COOKIE_VERSION = 'v1';

interface AuthData {
    keys: Record<string, boolean>;
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

function getAuthSecret(c: Context<AppEnv>): string {
    return c.env.ENCRYPTION_KEY || 'fallback-secret-change-this';
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

export async function isAuthenticated(c: Context<AppEnv>, key: string): Promise<boolean> {
    const secret = getAuthSecret(c);
    const cookie = getCookie(c, AUTH_COOKIE_NAME);
    const data = await decodeAuthCookie(cookie, secret);
    return data.keys[key] === true;
}

export async function setAuthenticated(c: Context<AppEnv>, key: string): Promise<void> {
    const secret = getAuthSecret(c);
    const cookie = getCookie(c, AUTH_COOKIE_NAME);
    const data = await decodeAuthCookie(cookie, secret);
    data.keys[key] = true;

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
