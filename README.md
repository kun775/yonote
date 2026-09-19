# YoNote Worker

YoNote 的 Cloudflare Workers 版本 - 轻量级 Markdown 笔记应用。

## 功能

- ✅ Markdown 实时预览
- ✅ 自动保存
- ✅ 密码保护
- ✅ 公开/私有笔记
- ✅ 内容加密存储
- ✅ 速率限制
- ✅ 管理后台

## 技术栈

- **运行时**: Cloudflare Workers
- **框架**: Hono
- **数据库**: D1 (SQLite)
- **加密**: Web Crypto API (AES-GCM)

## 部署

### 1. 安装依赖

```bash
npm install
```

### 2. 创建 D1 数据库

```bash
wrangler d1 create yonote-db
```

将返回的 `database_id` 更新到 `wrangler.toml`（`database_name` 必须是 `yonote-db`，与 `wrangler.toml` 和 npm scripts 保持一致）。

### 3. 初始化数据库

```bash
npm run db:init
```

### 4. 设置 Secrets

> 三个密钥必须彼此独立且不要复用本地开发值。生产应重新生成。

```bash
# 内容加密密钥（建议 32+ 字节随机值，例如 openssl rand -base64 32）
wrangler secret put ENCRYPTION_KEY

# 认证 Cookie 签名密钥（必须与 ENCRYPTION_KEY 使用不同的随机值）
wrangler secret put AUTH_SECRET

# 管理员密码哈希
# 推荐方式：本地运行 `node scripts/generate-password-hash.js <password>` 取回哈希
# 部署后也可以在 /admin/setup 表单生成，但只有在 ADMIN_PASSWORD 尚未设置时才能匿名访问
wrangler secret put ADMIN_PASSWORD

# dex 单点登录的机密客户端密钥（dex 侧必须是不含 none 的机密客户端）
# 删除该 secret 即可关闭 dex 登录入口
wrangler secret put DEX_CLIENT_SECRET
```

### 5. 部署

```bash
npm run deploy
```

## 本地开发

```bash
# 初始化本地数据库
npm run db:init:local

# 启动开发服务器
npm run dev
```

## 管理后台

访问 `/admin` 进入管理后台。

首次使用需要设置管理员密码，推荐做法：

1. 本地执行 `node scripts/generate-password-hash.js <password>` 生成哈希
2. 运行 `wrangler secret put ADMIN_PASSWORD` 并粘贴哈希值

也可以在刚部署、尚未配置 `ADMIN_PASSWORD` 的情况下，匿名访问 `/admin/setup` 用表单生成哈希。一旦 `ADMIN_PASSWORD` 设置完成，该路径就要求管理员登录后才能访问，防止成为 PBKDF2 计算的 DoS 入口。

### 登录入口：密码 / dex 单点登录

后台有两个互相独立的登录入口，四种组合都受支持：

| 密码入口 | dex 入口 | 结果 |
| --- | --- | --- |
| 开 | 关 | 仅密码登录（默认，保持向后兼容） |
| 关 | 开 | 仅 dex 单点登录 |
| 开 | 开 | 两个入口都展示，任选其一 |
| 关 | 关 | 禁止登录，登录页显示不可登录原因与恢复方式 |

入口可用性判定：

- 密码入口：`PASSWORD_ENABLED` 不为 `false`（缺省视为 `true`）**且**已配置 `ADMIN_PASSWORD`。
- dex 入口：`DEX_ISSUER` / `DEX_CLIENT_ID` / `DEX_CLIENT_SECRET` 齐全**且**白名单（`DEX_ALLOWED_SUBS` / `DEX_ALLOWED_USERS` / `DEX_ALLOWED_EMAILS`）非空。

关闭某个入口时，**该入口此前签发的会话会一并失效**（会话令牌首段记录签发来源，鉴权时按开关回查），因此关掉某个入口等同立刻切断这条通道。

### dex 单点登录配置

1. 在 dex 的 `staticClients` 中登记客户端（机密客户端，`secret` 与 `DEX_CLIENT_SECRET` 一致），`redirectURIs` 必须精确登记、不能用通配：

   - 生产：`https://note.ikun.day/admin/sso/callback`
   - 本地：`http://localhost:8787/admin/sso/callback`

   2026-09-19 实测 dex 侧的登记状态：

   | client_id | 生产回调 | 本地回调 |
   | --- | --- | --- |
   | `note-ikun-day` | ✅ 已登记（返回 dex 登录页） | ❌ 未登记（`400 Unregistered redirect_uri`） |
   | `yonote` | ❌ 客户端不存在（`404 Invalid client_id`） | ❌ |

   即本项目使用的 `client_id` 是 **`note-ikun-day`**；如需在本地调试 dex 登录，要把 `http://localhost:8787/admin/sso/callback` 补进该 client 的 `redirectURIs`。

2. 配置环境变量（见 `wrangler.toml`）：`DEX_ISSUER`、`DEX_CLIENT_ID`、`DEX_ALLOWED_USERS` / `DEX_ALLOWED_EMAILS`（或更推荐的 `DEX_ALLOWED_SUBS`）。
3. `wrangler secret put DEX_CLIENT_SECRET`。

实现要点：

- 采用授权码 + PKCE(S256) 流程，`state` / `nonce` / `code_verifier` 存于一次性签名 Cookie（10 分钟有效，回调后立即清除）。
- ⚠️ 管理员会话 Cookie（`yonote_admin`）的 `SameSite` 必须是 **`Lax`，不能是 `Strict`**：dex 回调与其后的
  `/admin/dashboard` 跳转同属一条由 dex 发起的跨站重定向链，`Strict` 会让回调刚下发的会话 Cookie 在下一跳
  不被携带，症状是「授权成功却退回登录页、且没有任何错误提示」。排障时先刷新一次登录页 —— 刷新即进后台
  即可确认是这一条。`Lax` 仍会拦截跨站 POST/DELETE，本应用的写操作全部是 POST/DELETE，CSRF 防护不受影响。
- 校验 `id_token` 的 RS256 签名（按 `kid` 动态选取 JWKS 密钥，支持密钥轮换）、`iss`、`aud`、`exp` 与 `nonce`。
- 权限判定优先使用不可变的 `sub`；`preferred_username` 与邮箱是首次接入的引导手段，**邮箱仅在 `email_verified` 为真时参与匹配**，且不做基于邮箱的账号自动合并。
- dex 未提供 `end_session_endpoint`：退出登录只清理本站会话，dex 侧会话状态由 dex 决定。

> 仓库若为公开仓库，白名单中的用户名与邮箱属于个人标识，建议改为 `wrangler secret put DEX_ALLOWED_USERS` 等 secret 形式。

### 变量真相来源与部署告警（keep_vars）

仅当 Worker 上次是**通过 Dashboard 发布**的（`last_deployed_from === "dash"`）时，`wrangler deploy` 才会取回远端配置做对比。
只要差异里含**破坏性**条目就弹「The local configuration being used ... differs from the remote configuration」并要求确认：

| 差异形态 | 含义 | 是否触发告警 |
| --- | --- | --- |
| `xxx__deleted`（`-`） | 远端有、本地配置没有 | 是 |
| `xxx__old`（`~`） | 同名但值不同 | 是 |
| `xxx`（`+`） | 本地新增 | 否 |

判定逻辑在 wrangler `cli.js` 的 `getRemoteConfigDiff` → `isNonDestructive`。注意它**完全不读 `keep_vars`**，
即 `keep_vars = true` 既不会抑制告警，也保护不了 `routes`。

两种自洽的用法，二选一，别混用：

| 做法 | 配置 | 生效值 | 说明 |
| --- | --- | --- | --- |
| **配置即真相**（推荐） | 删除 `keep_vars` | `wrangler.toml` | 同时把 Dashboard 上的同名变量删掉，否则仍会出现差异告警 |
| **Dashboard 即真相** | 保留 `keep_vars = true` | Dashboard | 阻止本地覆盖 Dashboard 已有变量；改配置可能不生效，最容易踩坑 |

> `keep_vars = true` 的实现是给上传元数据加 `keep_bindings: ["plain_text", "json"]`（见 wrangler 源码 `cli.js`），
> 语义是「保留远端已有、本次未上传的同类绑定」。同名键谁赢官方未写死，**实务上两处保持一致最稳**。

⚠️ 无论选哪种，`routes` 都要写进配置文件（见 `[[routes]]`）：Dashboard 侧存在 `note.ikun.day` 自定义域路由而配置缺失时，
每次部署都会提示覆盖，而 `keep_vars` 保护不了它。

## API 接口

### 读取指定笔记

```bash
curl https://your-domain.example/api/notes/<note-key>
```

私有保护笔记需要通过 `x-admin-auth` 请求头提交笔记密码：

```bash
curl https://your-domain.example/api/notes/<note-key> \
  -H "x-admin-auth: <note-password>"
```

### 写入指定笔记

默认覆盖写入；如果笔记不存在，会自动创建。

```bash
curl -X POST https://your-domain.example/api/notes/<note-key> \
  -H "Content-Type: application/json" \
  -d '{"content":"新的笔记内容"}'
```

追加写入：

```bash
curl -X POST https://your-domain.example/api/notes/<note-key> \
  -H "Content-Type: application/json" \
  -d '{"content":"追加内容","append":true}'
```

创建或更新密码保护笔记：

```bash
curl -X POST https://your-domain.example/api/notes/<note-key> \
  -H "Content-Type: application/json" \
  -d '{"content":"受保护内容","password":"note-password"}'
```

公开保护表示访问不需要密码，编辑需要密码：

```bash
curl -X POST https://your-domain.example/api/notes/<note-key> \
  -H "Content-Type: application/json" \
  -d '{"content":"公开可读内容","password":"note-password","public":true}'
```

编辑已有受保护笔记时，需要提交当前笔记密码：

```bash
curl -X POST https://your-domain.example/api/notes/<note-key> \
  -H "Content-Type: application/json" \
  -H "x-admin-auth: <note-password>" \
  -d '{"content":"更新后的内容"}'
```

## 测试

```bash
npm test
```

## 项目结构

```
.
├── src/
│   ├── index.ts              # 入口文件
│   ├── types.ts              # 类型定义
│   ├── routes/
│   │   ├── note.tsx          # 笔记路由
│   │   ├── api.ts            # API 路由
│   │   ├── admin.tsx         # 管理后台路由
│   │   └── sso.ts            # dex 单点登录路由
│   ├── middleware/
│   │   ├── auth.ts           # 认证中间件
│   │   ├── rateLimit.ts      # 速率限制
│   │   └── session.ts        # 会话管理
│   ├── services/
│   │   ├── authPolicy.ts     # 登录入口开关聚合
│   │   ├── crypto.ts         # 加密服务
│   │   ├── dex.ts            # dex OIDC 客户端
│   │   └── pdf.ts            # PDF 服务
│   ├── db/
│   │   ├── schema.sql        # 数据库 Schema
│   │   └── queries.ts        # 数据库查询
│   ├── views/
│   │   ├── layouts/
│   │   │   └── base.tsx      # 基础布局
│   │   ├── note/
│   │   │   ├── view.tsx      # 笔记视图
│   │   │   └── password.tsx  # 密码页面
│   │   └── admin/
│   │       ├── login.tsx     # 管理登录
│   │       ├── dashboard.tsx # 管理面板
│   │       └── notes.tsx     # 笔记管理
│   └── utils/
│       ├── time.ts           # 时间工具
│       └── validation.ts     # 验证工具
├── public/                   # Wrangler 静态资源
├── scripts/                  # 工具脚本
├── tests/                    # Node 测试
├── wrangler.toml             # Wrangler 配置
└── package.json
```

## 许可证

MIT
