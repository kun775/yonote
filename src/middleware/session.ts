import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { AppEnv } from '../types';
import { getAdminSession, createAdminSession as dbCreateAdminSession, deleteAdminSession } from '../db/queries';
import { generateSessionToken, verifyPassword } from '../services/crypto';

const ADMIN_COOKIE_NAME = 'yonote_admin';
const SESSION_DURATION = 24 * 60 * 60;

export async function isAdminAuthenticated(c: Context<AppEnv>): Promise<boolean> {
    const token = getCookie(c, ADMIN_COOKIE_NAME);
    if (!token) return false;

    const session = await getAdminSession(c.env.DB, token);
    return session !== null;
}

export async function createAdminSession(c: Context<AppEnv>): Promise<void> {
    const token = generateSessionToken();
    const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION;

    await dbCreateAdminSession(c.env.DB, token, expiresAt);

    setCookie(c, ADMIN_COOKIE_NAME, token, {
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        maxAge: SESSION_DURATION,
        path: '/admin'
    });
}

export async function destroyAdminSession(c: Context<AppEnv>): Promise<void> {
    const token = getCookie(c, ADMIN_COOKIE_NAME);
    if (token) {
        await deleteAdminSession(c.env.DB, token);
    }
    deleteCookie(c, ADMIN_COOKIE_NAME, { path: '/admin' });
}

export async function verifyAdminPassword(password: string, storedHash: string): Promise<boolean> {
    return verifyPassword(password, storedHash);
}

export const adminAuthMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
    const isAuth = await isAdminAuthenticated(c);
    if (!isAuth) {
        return c.redirect('/admin');
    }
    await next();
};
