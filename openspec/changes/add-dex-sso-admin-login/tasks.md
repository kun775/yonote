## 1. 实现
- [x] 1.1 新增 `src/services/dex.ts`：discovery、PKCE(S256)、state/nonce 签名 Cookie、授权码交换、`id_token` 验签（RS256 + 按 `kid` 取 JWKS）、白名单判定
- [x] 1.2 新增 `src/services/authPolicy.ts`：聚合 `PASSWORD_ENABLED` 与 dex 配置完整度，输出入口可用性
- [x] 1.3 改造 `src/middleware/session.ts`：会话令牌记录签发来源，鉴权时按开关回查；兼容旧格式令牌
- [x] 1.4 新增 `src/routes/sso.ts`：`/admin/sso/start`、`/admin/sso/callback`，错误统一回到 `/admin?error=<code>`
- [x] 1.5 改造 `src/routes/admin.tsx`：登录页下发入口策略、密码入口关闭时 POST 直接 403
- [x] 1.6 改造 `src/views/admin/login.tsx`：四态登录页（仅密码 / 仅 SSO / 双开 / 全关）
- [x] 1.7 补齐配置：`src/types.ts`、`wrangler.toml`、`wrangler.toml.example`、`.dev.vars.example`、`README.md`

## 2. 验证
- [x] 2.1 `tests/helpers/memory-d1.mjs` 支持 `admin_sessions`
- [x] 2.2 新增 `tests/sso-admin-login.test.mjs`：开关四态、旧令牌兼容、state 校验、伪造 dex 的完整回调链路、白名单拒绝
- [x] 2.3 `npm test`
- [x] 2.4 `npx tsc -p tsconfig.json`
- [ ] 2.5 部署后核验：`/admin` 同时出现两个入口；dex 侧完成一次真实登录
- [ ] 2.6 dex 侧登记回调地址：生产 `https://note.ikun.day/admin/sso/callback`、本地 `http://localhost:8787/admin/sso/callback`

## 3. 待办（需 dex 侧配合）
- [ ] 3.1 创建机密客户端 `yonote`，密钥写入 `wrangler secret put DEX_CLIENT_SECRET`
- [ ] 3.2 首次真实登录后从 Worker 日志取回 `sub`，将 `DEX_ALLOWED_USERS` / `DEX_ALLOWED_EMAILS` 收敛为 `DEX_ALLOWED_SUBS`
