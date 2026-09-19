# Change: 管理后台接入 dex 单点登录并增加登录入口开关

## Why
管理后台目前只有单一的管理密码入口：密码泄露后无法在不更换密码的前提下单独切断这条通道，也无法对多个管理员做独立身份识别。dex 已是自建 IdP（`https://auth.zkun.de/dex`），ldc-shop、shortkey 已接入，本次为 note.ikun.day（YoNote Worker）补齐同一条单点登录路径。

## What Changes
- 新增 `PASSWORD_ENABLED` 开关控制密码登录入口；缺省视为 `true`，保持既有部署行为。
- 新增 dex 单点登录入口：授权码 + PKCE(S256) 流程，入口为 `/admin/sso/start` 与 `/admin/sso/callback`。
- 两个入口互相独立，四种组合都受支持；两者都关闭时禁止登录并给出可读原因。
- 关闭某个入口时，该入口已签发的会话一并失效（会话令牌首段记录签发来源，鉴权时按开关回查）。
- dex 侧身份白名单优先使用不可变 `sub`；`preferred_username` 与邮箱为首次接入的引导手段。
- 登录页按运行时环境变量渲染入口，不再存在必然失败的登录表单。

## Impact
- Affected specs: `admin-auth`
- Affected code: `src/routes/sso.ts`（新增）、`src/services/dex.ts`（新增）、`src/services/authPolicy.ts`（新增）、`src/middleware/session.ts`、`src/routes/admin.tsx`、`src/views/admin/login.tsx`、`src/views/layouts/base.tsx`（仅新增样式）、`src/types.ts`、`wrangler.toml`、`.dev.vars.example`、`tests/`
- Database: 无结构变更。会话令牌由 `<随机串>` 变为 `<来源>.<随机串>`，旧格式令牌按密码会话兼容解析。
- 运维: 新增 Secret `DEX_CLIENT_SECRET`；dex 侧需登记回调地址 `/admin/sso/callback`。

## 已实测的 dex 硬约束
- 无 `end_session_endpoint`：不支持单点登出，退出只清本地会话。
- `token_endpoint_auth_methods_supported` 不含 `none`：必须使用机密客户端。
- `code_challenge_methods_supported` 含 `S256`；`id_token` 签名算法仅 `RS256`，JWKS 含多把密钥（须按 `kid` 选取）。
