import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { AppEnv } from '../types';
import { getAdminSession, createAdminSession as dbCreateAdminSession, deleteAdminSession } from '../db/queries';
import { generateSessionToken, verifyPassword } from '../services/crypto';
import {
    AUTH_MODE_PASSWORD,
    AUTH_MODE_DEX,
    getAuthPolicy,
    isAuthModeEnabled,
    type AuthMode
} from '../services/authPolicy';

const ADMIN_COOKIE_NAME = 'yonote_admin';
const SESSION_DURATION = 24 * 60 * 60;
const SESSION_MODE_SEPARATOR = '.';

// parseSessionToken 解析会话令牌的签发来源
//
// 参数:
//   - token string: Cookie 中的会话令牌
//
// 元数据:
//   - 作者: VitaHuang
//   - 创建时间: 2026-09-19
//   - 更新时间: 2026-09-19
//   - 更新内容: 初始化来源解析；旧格式令牌（不含 "p." / "d." 前缀）视为密码会话，避免升级踢掉已登录设备。
function parseSessionToken(token: string): { mode: AuthMode; raw: string } {
    const index = token.indexOf(SESSION_MODE_SEPARATOR);
    if (index <= 0) {
        return { mode: AUTH_MODE_PASSWORD, raw: token };
    }

    const prefix = token.slice(0, index);
    if (prefix === AUTH_MODE_PASSWORD || prefix === AUTH_MODE_DEX) {
        return { mode: prefix, raw: token.slice(index + 1) };
    }
    return { mode: AUTH_MODE_PASSWORD, raw: token };
}

// isAdminAuthenticated 校验管理员会话是否有效
//
// 参数:
//   - c Context<AppEnv>: Hono 请求上下文
//
// 元数据:
//   - 作者: VitaHuang
//   - 创建时间: 2026-05-08
//   - 更新时间: 2026-09-19
//   - 更新内容: 增加会话来源回查，关闭某个登录入口时其已签发会话同步失效。
export async function isAdminAuthenticated(c: Context<AppEnv>): Promise<boolean> {
    const token = getCookie(c, ADMIN_COOKIE_NAME);
    if (!token) return false;

    const session = await getAdminSession(c.env.DB, token);
    if (!session) return false;

    // 仅验签名/存在性不够：入口被关闭后，旧会话必须一并失效
    const { mode } = parseSessionToken(token);
    return isAuthModeEnabled(getAuthPolicy(c.env), mode);
}

// createAdminSession 为指定登录来源建立管理员会话
//
// 参数:
//   - c Context<AppEnv>: Hono 请求上下文
//   - mode AuthMode: 会话签发来源，缺省为密码登录
//
// 元数据:
//   - 作者: VitaHuang
//   - 创建时间: 2026-05-08
//   - 更新时间: 2026-09-19
//   - 更新内容: 令牌首段标记签发来源，供后续按开关回查；Cookie 的 SameSite 由 Strict 放宽为 Lax（SSO 回调链路必需）。
export async function createAdminSession(c: Context<AppEnv>, mode: AuthMode = AUTH_MODE_PASSWORD): Promise<void> {
    const token = `${mode}${SESSION_MODE_SEPARATOR}${generateSessionToken()}`;
    const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION;

    await dbCreateAdminSession(c.env.DB, token, expiresAt);

    // SameSite 必须为 Lax，不能用 Strict：
    // dex 回调是「从 IdP 域发起的顶层跳转」，整条重定向链（callback → /admin/dashboard）在浏览器看来都是跨站导航，
    // Strict 会导致这里刚下发的会话 Cookie 在下一跳不携带 —— 表现为「授权成功但立刻退回登录页」，且没有任何错误提示。
    // Lax 已足够：跨站顶层 GET 放行，跨站 POST/PUT/DELETE 仍然被拦，而本应用的写操作全部是 POST/DELETE。
    setCookie(c, ADMIN_COOKIE_NAME, token, {
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
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
