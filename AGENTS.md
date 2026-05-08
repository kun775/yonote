<!-- OPENSPEC:START -->
# OpenSpec 说明

这些说明适用于本项目中的 AI 助手。

当请求符合以下情况时，始终打开 `@/openspec/AGENTS.md`：
- 提到计划或提案（如 proposal、spec、change、plan 等词）
- 引入新能力、破坏性变更、架构调整，或较大的性能/安全工作
- 需求听起来不明确，需要先参考权威规范再编码

通过 `@/openspec/AGENTS.md` 了解：
- 如何创建和应用变更提案
- 规范格式和约定
- 项目结构和指南

保留此托管区块，方便 `openspec update` 刷新说明。

<!-- OPENSPEC:END -->

# 仓库指南

## 项目概览
YoNote Worker 是一个用于轻量级 Markdown 笔记应用的 Cloudflare Workers 后端。项目使用 Hono 路由、D1（SQLite）存储，以及 Web Crypto API（AES-GCM）进行加密。

## 项目结构与模块组织
- `src/`：Worker 源代码。
  - `src/index.ts`：入口文件，挂载各路由模块。
  - `src/routes/`：HTTP 路由（`note.tsx`、`api.ts`、`admin.tsx`）。
  - `src/middleware/`：认证、会话、速率限制等中间件。
  - `src/services/`：共享服务（如 `crypto`）。
  - `src/db/`：`schema.sql` 与查询辅助函数。
  - `src/views/`：用于服务端渲染页面的 TSX 模板。
- `public/`：由 Wrangler `[assets]` 提供的静态资源（见 `wrangler.toml`），例如 `public/static/`。
- `scripts/`：小型工具脚本（如密码哈希生成器）。

## 构建、测试与开发命令
本仓库使用 npm（锁文件：`package-lock.json`）。

```bash
npm install
npm run db:init:local   # 将 `src/db/schema.sql` 应用到本地 D1
npm run dev             # 通过 `wrangler dev` 启动本地 Worker
```

远程初始化与部署：

```bash
npm run db:init         # 将 schema 应用到远程 D1
npm run deploy          # 部署（使用 `wrangler.toml`）
npx wrangler deploy --env production
```

管理员密码哈希辅助工具：

```bash
node scripts/generate-password-hash.js <password>
```

## 代码风格与命名约定
- 使用严格类型检查的 TypeScript/TSX（`tsconfig.json`）；保持改动类型安全。
- 匹配现有代码风格：4 空格缩进、单引号、分号。
- 命名：变量和函数使用 `camelCase`，类型和组件使用 `PascalCase`，`src/routes/` 下文件名使用小写。

## 测试指南
项目已配置 Node 测试脚本。提交前最低限度验证：
- `npm test`
- `npx tsc -p tsconfig.json`（类型检查）
- `npm run dev` 冒烟测试：创建/编辑笔记、密码保护笔记，以及 `/admin` 登录流程。

## 提交与 Pull Request 指南
该工作区可能不包含 Git 历史。如果通过 Git 贡献，使用简单的 Conventional Commits 风格：
- `feat: ...`、`fix: ...`、`chore: ...`、`docs: ...`

评审或 PR 中应包含：
- 修改内容与原因，以及简短的手动测试说明（命令和 URL）。
- UI/模板改动（`src/views/` 或 `public/static/`）需附截图。

## 安全与配置提示
- 不要提交真实密钥。使用 `.dev.vars` 保存本地专用变量，生产环境使用 `wrangler secret put ...` 设置（`ENCRYPTION_KEY`、`ADMIN_PASSWORD`）。
- 如果部署看起来未生效，参考 `CACHE_PURGE.md` 处理 Cloudflare 缓存清理。
