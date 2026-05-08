import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types';
import { getLockout, createOrUpdateLockout, clearLockout } from '../db/queries';

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 30 * 60;

export function getClientIP(c: Context<AppEnv>): string {
    return c.req.header('CF-Connecting-IP') ||
           c.req.header('X-Forwarded-For')?.split(',')[0].trim() ||
           'unknown';
}

export async function isLockedOut(c: Context<AppEnv>, noteKey: string): Promise<{ locked: boolean; remaining: number }> {
    const ip = getClientIP(c);
    const lockout = await getLockout(c.env.DB, ip, noteKey);

    if (!lockout || !lockout.locked_until) {
        return { locked: false, remaining: 0 };
    }

    const now = Math.floor(Date.now() / 1000);
    if (lockout.locked_until > now) {
        return { locked: true, remaining: lockout.locked_until - now };
    }

    await clearLockout(c.env.DB, ip, noteKey);
    return { locked: false, remaining: 0 };
}

export async function recordFailedAttempt(c: Context<AppEnv>, noteKey: string): Promise<{ locked: boolean; attemptsRemaining: number }> {
    const ip = getClientIP(c);
    const lockout = await getLockout(c.env.DB, ip, noteKey);
    const attempts = (lockout?.attempts || 0) + 1;

    if (attempts >= MAX_ATTEMPTS) {
        const lockedUntil = Math.floor(Date.now() / 1000) + LOCKOUT_DURATION;
        await createOrUpdateLockout(c.env.DB, ip, noteKey, attempts, lockedUntil);
        return { locked: true, attemptsRemaining: 0 };
    }

    await createOrUpdateLockout(c.env.DB, ip, noteKey, attempts, null);
    return { locked: false, attemptsRemaining: MAX_ATTEMPTS - attempts };
}

export async function clearFailedAttempts(c: Context<AppEnv>, noteKey: string): Promise<void> {
    const ip = getClientIP(c);
    await clearLockout(c.env.DB, ip, noteKey);
}

export const rateLimitMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
    await next();
};
