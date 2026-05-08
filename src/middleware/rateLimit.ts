import type { Context } from 'hono';
import type { AppEnv } from '../types';
import {
    getLockout,
    createOrUpdateLockout,
    clearLockout,
    getRateLimit,
    resetRateLimit,
    incrementRateLimit
} from '../db/queries';

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 30 * 60;

// 单次写入内容上限（加密前），与 D1 单行默认容量留出缓冲
export const MAX_NOTE_CONTENT_BYTES = 256 * 1024;

// 写入限流窗口：每 IP 每分钟 30 次
export const WRITE_RATE_LIMIT_WINDOW = 60;
export const WRITE_RATE_LIMIT_MAX = 30;

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

// checkWriteRateLimit 对 IP + bucket 施加滚动窗口写入限流。
//
// 返回值:
//   - allowed: true 表示放行，false 表示命中限流
//   - retryAfter: 命中限流时距离下一次可重试的秒数
//
// 元数据:
//   - 作者: VitaHuang
//   - 创建时间: 2026-05-09
//   - 更新时间: 2026-05-09
//   - 更新内容: 初始化写入端点的按 IP 滚动窗口限流，防止匿名公开笔记被刷写。
export async function checkWriteRateLimit(
    c: Context<AppEnv>,
    bucket: string,
    max: number = WRITE_RATE_LIMIT_MAX,
    windowSeconds: number = WRITE_RATE_LIMIT_WINDOW
): Promise<{ allowed: boolean; retryAfter: number }> {
    const ip = getClientIP(c);
    if (ip === 'unknown') {
        // 无法识别 IP 时不作限流，避免误伤；CF-Connecting-IP 在 Workers 上总是存在
        return { allowed: true, retryAfter: 0 };
    }

    const now = Math.floor(Date.now() / 1000);
    const record = await getRateLimit(c.env.DB, ip, bucket);

    if (!record || record.reset_at <= now) {
        await resetRateLimit(c.env.DB, ip, bucket, now + windowSeconds);
        return { allowed: true, retryAfter: 0 };
    }

    if (record.count >= max) {
        return { allowed: false, retryAfter: Math.max(1, record.reset_at - now) };
    }

    await incrementRateLimit(c.env.DB, ip, bucket);
    return { allowed: true, retryAfter: 0 };
}
