import type { Context } from 'hono';
import type { AppEnv } from '../types';
import {
    getLockout,
    incrementLockout,
    clearLockout,
    getRateLimit,
    resetRateLimit,
    incrementRateLimit
} from '../db/queries';

// 同一 IP 对同一目标在计数窗口内最多尝试 5 次
const MAX_ATTEMPTS = 5;
export const LOCKOUT_DURATION = 30 * 60;

// 同一目标跨所有 IP 的尝试上限，防止轮换 IP（如 IPv6）绕过单 IP 锁定。
// 代价：攻击者可让该目标的密码验证暂停一个锁定周期，但已登录的会话不受影响。
const GLOBAL_MAX_ATTEMPTS = 20;
const GLOBAL_LOCKOUT_IP = '*';

export interface PasswordAttempt {
    /** false 表示已被锁定，本次不得校验密码 */
    allowed: boolean;
    /** 锁定剩余秒数，仅 allowed 为 false 时有意义 */
    remaining: number;
    /** 本次若校验失败，还剩几次机会；为 0 表示本次失败后即锁定 */
    attemptsRemaining: number;
}

// 单次写入内容上限（加密前），与 D1 单行默认容量留出缓冲
export const MAX_NOTE_CONTENT_BYTES = 256 * 1024;

// 写入限流窗口：每 IP 每分钟 30 次
export const WRITE_RATE_LIMIT_WINDOW = 60;
export const WRITE_RATE_LIMIT_MAX = 30;

// 新建笔记配额：每 IP 每小时 30 篇（网页与 API 共用），限制匿名用户换 key 持续写入撑满存储
export const NOTE_CREATE_LIMIT_WINDOW = 60 * 60;
export const NOTE_CREATE_LIMIT_MAX = 30;

export function getClientIP(c: Context<AppEnv>): string {
    return c.req.header('CF-Connecting-IP') ||
           c.req.header('X-Forwarded-For')?.split(',')[0].trim() ||
           'unknown';
}

async function getActiveLockRemaining(c: Context<AppEnv>, ip: string, noteKey: string, now: number): Promise<number> {
    const lockout = await getLockout(c.env.DB, ip, noteKey);
    if (!lockout || !lockout.locked_until) {
        return 0;
    }
    if (lockout.locked_until > now) {
        return lockout.locked_until - now;
    }

    await clearLockout(c.env.DB, ip, noteKey);
    return 0;
}

// isLockedOut 只读地判断目标当前是否被锁定（单 IP 锁或全局锁任一生效即锁定），不消耗尝试次数。
export async function isLockedOut(c: Context<AppEnv>, noteKey: string): Promise<{ locked: boolean; remaining: number }> {
    const now = Math.floor(Date.now() / 1000);
    const remaining = Math.max(
        await getActiveLockRemaining(c, getClientIP(c), noteKey, now),
        await getActiveLockRemaining(c, GLOBAL_LOCKOUT_IP, noteKey, now)
    );
    return { locked: remaining > 0, remaining };
}

// beginPasswordAttempt 在校验密码「之前」先原子地占用一次尝试次数。
//
// 先计数后校验，才能让并发请求无法在锁定生效前同时通过检查；
// 校验成功后调用方必须调用 clearFailedAttempts 归零，失败则无需再记录。
export async function beginPasswordAttempt(c: Context<AppEnv>, noteKey: string): Promise<PasswordAttempt> {
    const now = Math.floor(Date.now() / 1000);
    const perIp = await incrementLockout(c.env.DB, getClientIP(c), noteKey, MAX_ATTEMPTS, LOCKOUT_DURATION, LOCKOUT_DURATION);
    const global = await incrementLockout(c.env.DB, GLOBAL_LOCKOUT_IP, noteKey, GLOBAL_MAX_ATTEMPTS, LOCKOUT_DURATION, LOCKOUT_DURATION);

    if (perIp.attempts > MAX_ATTEMPTS || global.attempts > GLOBAL_MAX_ATTEMPTS) {
        const remaining = Math.max(
            perIp.attempts > MAX_ATTEMPTS ? (perIp.locked_until ?? now) - now : 0,
            global.attempts > GLOBAL_MAX_ATTEMPTS ? (global.locked_until ?? now) - now : 0
        );
        return { allowed: false, remaining: Math.max(1, remaining), attemptsRemaining: 0 };
    }

    return {
        allowed: true,
        remaining: 0,
        attemptsRemaining: Math.min(MAX_ATTEMPTS - perIp.attempts, GLOBAL_MAX_ATTEMPTS - global.attempts)
    };
}

export async function clearFailedAttempts(c: Context<AppEnv>, noteKey: string): Promise<void> {
    await clearLockout(c.env.DB, getClientIP(c), noteKey);
    await clearLockout(c.env.DB, GLOBAL_LOCKOUT_IP, noteKey);
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

// checkNoteCreateLimit 只在即将新建笔记时调用，消耗一次新建配额
export function checkNoteCreateLimit(c: Context<AppEnv>): Promise<{ allowed: boolean; retryAfter: number }> {
    return checkWriteRateLimit(c, 'note:create', NOTE_CREATE_LIMIT_MAX, NOTE_CREATE_LIMIT_WINDOW);
}
