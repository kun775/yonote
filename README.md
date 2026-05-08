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
│   │   └── admin.tsx         # 管理后台路由
│   ├── middleware/
│   │   ├── auth.ts           # 认证中间件
│   │   ├── rateLimit.ts      # 速率限制
│   │   └── session.ts        # 会话管理
│   ├── services/
│   │   ├── crypto.ts         # 加密服务
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
