# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

YoNote Worker：运行在 Cloudflare Workers 上的 Markdown 笔记应用（Hono + D1 + Web Crypto）。项目概览、代码风格和 OpenSpec 流程见 `AGENTS.md`；涉及提案、新能力或架构调整时先读 `openspec/AGENTS.md`，进行中的变更在 `openspec/changes/`。

## 常用命令

```bash
npm test                                   # node --test tests/*.test.mjs
node --test tests/api-notes.test.mjs       # 运行单个测试文件
node --test --test-name-pattern="关键词" tests/note-update.test.mjs   # 按用例名过滤
npm run typecheck                          # tsc -p tsconfig.json（只覆盖 src/）
npm run db:init:local                      # 把 src/db/schema.sql 应用到本地 D1
npm run dev                                # wrangler dev，默认 http://localhost:8787
```

- 没有配置 lint / formatter。
- 测试依赖 Node 原生 TS 类型剥离（需 Node ≥ 22.18），以及 wrangler 间接带入的 `esbuild`（未在 package.json 声明）。
- 部署：`npm run deploy` 部署的是 `wrangler.toml` **顶层**配置（`--env=""`）；生产配置在 `[env.production.*]`，用 `npx wrangler deploy --env production`。Wrangler 环境块不继承顶层 bindings / routes，新增绑定或路由要两处都写。
- `keep_vars = true`：Dashboard 上的变量可能覆盖本地值，改开关 / 客户端 ID 时 `wrangler.toml` 与 Dashboard 要保持一致（原因见 README「变量真相来源与部署告警」）。
- 本地密钥放 `.dev.vars`（模板 `.dev.vars.example`）：`ENCRYPTION_KEY`、`AUTH_SECRET`、`ADMIN_PASSWORD`（PBKDF2 哈希，用 `node scripts/generate-password-hash.js <password>` 生成）、`DEX_CLIENT_SECRET`。

## 架构

### 请求入口与路由

`src/index.ts` 统一加安全响应头（含 CSP）后按顺序挂载 `/api` → `/admin` → `/`（`noteRoutes` 的 `/:key` 是兜底路由，必须最后挂载）。默认导出是 `{ fetch, scheduled }`：`scheduled` 由 `wrangler.toml` 的 `[triggers]` 每小时触发，清理过期的会话、锁定和限流记录；Hono 实例另以具名导出 `app` 供测试使用。静态资源由 `wrangler.toml` 的 `[assets]` 直接从 `public/` 提供，不经过 Hono。

- `src/routes/note.tsx`：浏览器端笔记页面与表单/AJAX 端点（`/:key/auto-save`、`/:key/update`、`/:key/verify`、`/:key/download` 等）。所有 `/:key/:action` 子路由由同一个中间件先做 `isValidKey` 校验。
- `src/routes/api.ts`：第三方 JSON API（`GET/POST /api/notes/:key`），笔记密码走 `x-admin-auth` 请求头。
- `src/routes/admin.tsx` + `src/routes/sso.ts`：管理后台，`sso.ts` 挂在 `/admin/sso` 下。

### 笔记模型（跨多个文件的关键约定）

- **惰性创建**：`GET /` 生成随机 key 后重定向；`GET /:key` 对不存在的笔记只渲染空编辑页、不写库，首次 `auto-save` / `update` 才 `createNote`。key 必须满足 `isValidKey`（`src/utils/validation.ts`）。
- **内容加密**：写入时总是用 `ENCRYPTION_KEY` 做 AES-GCM 加密（见 `src/services/crypto.ts`）。当前格式是 `v2:` + base64(salt|iv|密文)，用 HKDF 派生密钥；无前缀的历史密文按 PBKDF2 解密，下次写入时自动转成 v2。`notes.encrypted` 标记区分历史明文。更换 `ENCRYPTION_KEY` 会导致已有笔记无法解密。
- **笔记密码**：存储格式 `pbkdf2$<iterations>$<salt>$<hash>`；旧的无前缀 SHA-256 hex 仍可校验，校验成功后自动升级为 PBKDF2（`isLegacyPasswordHash`）。
- **可见性**：无密码 = 任何人可编辑；有密码 + `public=1` = 可读、编辑需密码；有密码 + `public=0` = 需密码才能看。
- **浏览器授权**：`src/middleware/auth.ts` 用 `AUTH_SECRET` 做 HMAC 签名的 `yonote_auth` Cookie 记录已授权的 key（LRU 最多 50 个）。受保护笔记存的是 `HMAC(key:passwordHash)`，改密码会让旧授权自动失效。
- **防滥用**（`src/middleware/rateLimit.ts`，状态都存在 D1）：
  - 密码尝试（笔记密码与后台密码登录）：在校验**之前**调用 `beginPasswordAttempt` 原子地占用一次次数，校验成功后调用 `clearFailedAttempts`。限制是同一 IP 30 分钟内 5 次，同一目标跨所有 IP 30 分钟内 20 次（全局计数行的 `ip` 记为 `'*'`），记录在 `lockouts` 表。不要改回「先检查锁定、失败后再记录」的写法，并发请求会绕过锁定。
  - 写入端点：按 IP + bucket 每 60 秒最多 30 次；新建笔记另有 `checkNoteCreateLimit`，每 IP 每小时 30 篇，网页和 API 共用。两者都记在 `rate_limits` 表。
  - 内容上限 `MAX_NOTE_CONTENT_BYTES`（256 KiB）。新增写入端点应复用上述检查。

### 管理后台登录

- 两个独立入口：密码（`PASSWORD_ENABLED` 缺省为开且需配置 `ADMIN_PASSWORD`）与 dex OIDC 单点登录（凭据齐全且白名单非空）。可用性统一由 `src/services/authPolicy.ts` 的 `getAuthPolicy` 每次请求实时计算。
- 会话存 `admin_sessions` 表，Cookie `yonote_admin` 的令牌带来源前缀 `p.` / `d.`；`isAdminAuthenticated` 会按来源回查当前开关，所以关闭某入口会立即让它签发的会话失效。无前缀的旧令牌按密码会话处理。
- `yonote_admin` 的 `SameSite` 必须是 `Lax` 不能改成 `Strict`，否则 dex 回调后的跳转拿不到会话 Cookie（详见 README）。
- dex 流程（`src/services/dex.ts`）：授权码 + PKCE，state/nonce/verifier 存在一次性签名 Cookie；`id_token` 校验 RS256 签名（按 `kid` 选 JWKS）、`iss`、`aud`、`exp`、`nonce`。白名单优先 `sub`；用户名白名单只匹配原始 `preferred_username`（`DexIdentity.username` 带回退值，只用于日志，不能参与权限判定）；邮箱仅在 `email_verified` 为真时参与匹配。

### 视图与前端

- 服务端用 `hono/jsx` 渲染（`src/views/`），页面状态通过 `<body data-*>` 传给前端；`public/static/function.js` 读取这些 data 属性初始化全局变量，`app.js` 负责编辑器、自动保存等交互。`public/static/*.js` 是不经构建、不做类型检查的原生 JS。
- Markdown 在浏览器端渲染，入口是 `function.js` 的 `convertToHtml`。它基于 marked（CommonMark + GFM），另外扩展了 `[TOC]`、`==高亮==`、标题锚点 id 和公式保护（`$`、`$$`、`\(`、`\[` 包进 `.math-inline` / `.math-block`，`app.js` 只对这些元素调用 KaTeX）。链接和图片地址经 `sanitizeUrl` 按协议白名单过滤。
- 渲染结果写入 DOM 前必须经过 DOMPurify。`convertToHtml(content, { allowHtml })` 只在随后会净化时才传 `allowHtml: true`，否则原始 HTML 一律转义。
- marked（dependencies，PDF 导出也在服务端用它）和 DOMPurify（devDependencies）在 package.json 里都锁定了精确版本，由 `npm run vendor` 复制到 `public/static/vendor/` 同源提供，测试也加载同一份文件；升级版本后要重新运行它并提交 vendor 文件。KaTeX、highlight.js、mermaid 仍从 CDN 加载（见 `src/views/layouts/base.tsx`）。新增外部资源必须同步放宽 `src/index.ts` 的 CSP，字体也受 `font-src` 限制。
- 后台样式内联在 `base.tsx` 的 `ADMIN_PAGE_STYLES`，遵循根目录 `DESIGN.md`（Notion 设计系统）；类名、`data-*` 钩子和表单 action 被 `public/static/admin.js` 依赖，改样式时不要改这些。
- `src/services/pdf.ts` 负责 `/:key/download?format=pdf`：用 marked 词法分析得到与预览一致的块结构，再由手写排版引擎输出 PDF（单一 STSong-Light 字体，行内格式输出为纯文本）。`[TOC]`、`==高亮==`、公式这几个扩展在这里和 `function.js` 里各实现了一份，修改匹配规则时两边要一起改，`tests/pdf-export.test.mjs` 会覆盖。

### 数据库

- `src/db/schema.sql` 全部是 `CREATE ... IF NOT EXISTS`，没有迁移机制；改已有表结构需要另写 `ALTER` 并分别对本地 / 远程 D1 执行。
- 所有 SQL 集中在 `src/db/queries.ts`，时间戳统一为 Unix 秒。

## 测试约定

- 路由测试通过 esbuild 把 `src/routes/*.ts(x)` 打包成 data URL 再 import（`tests/helpers/load-module.mjs`，部分测试文件内联了同样的逻辑），然后用 `routes.request(path, init, env)` 直接调用，不启动 wrangler。纯工具模块可直接 `import '../src/....ts'`。
- `tests/helpers/memory-d1.mjs` 是按 SQL 字符串匹配的内存 D1 替身，`createTestEnv()` 提供默认 env。**未识别的 SQL 会静默返回空结果 / `changes: 0`**，所以新增或修改 `queries.ts` 里的 SQL 时，要同步更新这个替身，否则测试可能假通过。
- `tests/helpers/sqlite-d1.mjs` 基于 `node:sqlite`，加载真实的 `schema.sql`。包含 UPSERT、`CASE`、`RETURNING` 等逻辑的 SQL 要用它测，才能验证 SQL 本身写对了（例如 `tests/lockout.test.mjs`）。
