import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { AppEnv } from '../types';
import { cleanExpiredSessions } from '../db/queries';
import { createAdminSession } from '../middleware/session';
import { AUTH_MODE_DEX, getAuthPolicy } from '../services/authPolicy';
import {
    DEX_STATE_COOKIE,
    createAuthorizeRequest,
    exchangeAndVerify,
    getDexConfig,
    isIdentityAllowed,
    matchesState,
    type DexIdentity
} from '../services/dex';

// dex 单点登录路由（挂载于 /admin/sso）
//
// 路由均不经过 adminAuthMiddleware：登录前必须可访问。
// 所有错误统一回到 /admin?error=<code>，由登录页映射为可读文案，避免暴露原始错误码。

export const ssoRoutes = new Hono<AppEnv>();

const STATE_COOKIE_PATH = '/admin';

function redirectAuthError(c: Context<AppEnv>, code: string) {
    return c.redirect(`/admin?error=${code}`, 302);
}

// GET /admin/sso/start 发起 dex 授权跳转
//
// 元数据:
//   - 作者: VitaHuang
//   - 创建时间: 2026-09-19
//   - 更新时间: 2026-09-19
//   - 更新内容: 初始化授权入口；state/nonce/PKCE verifier 写入一次性 SameSite=Lax Cookie。
ssoRoutes.get('/start', async (c) => {
    if (!getAuthPolicy(c.env).dexEnabled) {
        return redirectAuthError(c, 'sso_unavailable');
    }

    try {
        const request = await createAuthorizeRequest(c.env, c.req.url);

        // 必须 SameSite=Lax：回调是从 IdP 域发起的顶层跳转，Strict 会导致 state Cookie 不被携带
        setCookie(c, DEX_STATE_COOKIE, request.stateCookie, {
            httpOnly: true,
            secure: true,
            sameSite: 'Lax',
            maxAge: request.maxAge,
            path: STATE_COOKIE_PATH
        });

        return c.redirect(request.url, 302);
    } catch (error) {
        console.error('dex 授权跳转失败:', error);
        return redirectAuthError(c, 'sso_unavailable');
    }
});

// GET /admin/sso/callback 处理 dex 授权回调
//
// 元数据:
//   - 作者: VitaHuang
//   - 创建时间: 2026-09-19
//   - 更新时间: 2026-09-19
//   - 更新内容: 初始化回调处理；state 定时安全比较、nonce 绑定、id_token 验签与白名单判定；
//              成功/拒绝两条路径各补一条结构化日志，便于用 wrangler tail 区分「白名单拒绝」与「Cookie 未携带」。
ssoRoutes.get('/callback', async (c) => {
    const policy = getAuthPolicy(c.env);
    const stateCookie = getCookie(c, DEX_STATE_COOKIE);

    // 一次性 Cookie：成功与失败两条路径都必须清除，否则会污染下一次登录
    deleteCookie(c, DEX_STATE_COOKIE, { path: STATE_COOKIE_PATH });

    if (!policy.dexEnabled) {
        return redirectAuthError(c, 'sso_unavailable');
    }

    const providerError = c.req.query('error');
    if (providerError) {
        console.warn(`dex 回调返回错误: ${providerError}`);
        return redirectAuthError(c, providerError === 'access_denied' ? 'sso_denied' : 'sso_failed');
    }

    const secret = c.env.AUTH_SECRET?.trim();
    if (!secret) {
        console.error('dex 回调失败: AUTH_SECRET 未配置');
        return redirectAuthError(c, 'sso_unavailable');
    }

    const code = c.req.query('code');
    const state = c.req.query('state');
    if (!code || !stateCookie || !(await matchesState(stateCookie, state, secret))) {
        console.warn('dex 回调 state 校验失败');
        return redirectAuthError(c, 'sso_state');
    }

    let result: { identity: DexIdentity; redirectUri: string };
    try {
        result = await exchangeAndVerify(c.env, code, stateCookie);
    } catch (error) {
        console.error('dex 登录失败:', error);
        return redirectAuthError(c, 'sso_failed');
    }

    const config = getDexConfig(c.env);
    if (!config || !isIdentityAllowed(config, result.identity)) {
        // 打印身份三元组，便于首次接入时反查 sub 并改用不可变 sub 白名单
        console.warn(
            `dex 登录被拒绝(不在白名单): sub=${result.identity.sub} ` +
            `user=${result.identity.username} email=${result.identity.email ?? '-'} ` +
            `emailVerified=${result.identity.emailVerified} ` +
            `allowlist(subs/users/emails)=${config?.allowedSubs.length ?? 0}/` +
            `${config?.allowedUsers.length ?? 0}/${config?.allowedEmails.length ?? 0}`
        );
        return redirectAuthError(c, 'sso_forbidden');
    }

    await cleanExpiredSessions(c.env.DB);
    await createAdminSession(c, AUTH_MODE_DEX);

    // 成功日志：与「静默退回登录页」（Cookie 未随重定向携带）区分开，排障时先看有没有这一行
    console.log(
        `dex 登录成功: sub=${result.identity.sub} user=${result.identity.username} ` +
        `email=${result.identity.email ?? '-'}`
    );

    return c.redirect('/admin/dashboard', 302);
});
