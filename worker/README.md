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
cd worker
npm install
```

### 2. 创建 D1 数据库

```bash
wrangler d1 create yonote
```

将返回的 database_id 更新到 `wrangler.toml`。

### 3. 初始化数据库

```bash
npm run db:init
```

### 4. 设置 Secrets

```bash
# 设置加密密钥
wrangler secret put ENCRYPTION_KEY

# 生成管理员密码哈希
# 访问 /admin/setup?password=your_password 获取哈希值
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

首次使用需要设置管理员密码：
1. 访问 `/admin/setup?password=你的密码`
2. 复制返回的哈希值
3. 运行 `wrangler secret put ADMIN_PASSWORD` 并粘贴哈希值

## 项目结构

```
worker/
├── src/
│   ├── index.ts              # 入口文件
│   ├── types.ts              # 类型定义
│   ├── routes/
│   │   ├── note.ts           # 笔记路由
│   │   ├── api.ts            # API 路由
│   │   └── admin.ts          # 管理后台路由
│   ├── middleware/
│   │   ├── auth.ts           # 认证中间件
│   │   ├── rateLimit.ts      # 速率限制
│   │   └── session.ts        # 会话管理
│   ├── services/
│   │   └── crypto.ts         # 加密服务
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
├── static/                   # 静态资源
├── wrangler.toml             # Wrangler 配置
└── package.json
```

## 许可证

MIT
