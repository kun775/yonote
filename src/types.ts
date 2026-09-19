import type { D1Database } from '@cloudflare/workers-types';

export interface Bindings {
    DB: D1Database;
    ENCRYPTION_KEY: string;
    AUTH_SECRET: string;
    ADMIN_PASSWORD: string;
    ENVIRONMENT: string;

    /** 管理后台密码登录开关，缺省视为 "true"（保持既有部署行为） */
    PASSWORD_ENABLED?: string;

    /** dex OIDC issuer，例如 https://auth.zkun.de/dex */
    DEX_ISSUER?: string;
    /** dex 客户端 ID（机密客户端） */
    DEX_CLIENT_ID?: string;
    /** dex 客户端密钥，只放 wrangler secret，禁止写入仓库 */
    DEX_CLIENT_SECRET?: string;
    /** 显式指定回调地址；留空时按请求域名 + /admin/sso/callback 推导 */
    DEX_REDIRECT_URI?: string;
    /** 管理员白名单：不可变 sub（逗号或空白分隔），优先使用 */
    DEX_ALLOWED_SUBS?: string;
    /** 管理员白名单：preferred_username（逗号或空白分隔） */
    DEX_ALLOWED_USERS?: string;
    /** 管理员白名单：邮箱（逗号或空白分隔，仅在 email_verified 为真时生效） */
    DEX_ALLOWED_EMAILS?: string;
}

export interface AppEnv {
    Bindings: Bindings;
}
