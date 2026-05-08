# Change: 增加指定笔记 API 读写能力

## Why
当前 `/api` 仅提供健康检查，第三方服务无法通过稳定的 JSON API 读取和写入指定 note。现有页面路由依赖 HTML 表单和浏览器会话，不适合服务端集成。

## What Changes
- 新增 `GET /api/notes/:key`，读取指定 note 的明文内容和基础元数据。
- 新增 `POST /api/notes/:key`，写入指定 note，支持覆盖写入和追加写入。
- 第三方服务通过 `x-admin-auth: <password>` 请求头提交 note 密码，不依赖 Cookie 会话。
- 写入不存在的 note 时自动创建；请求体提供 `password` 时为新 note 或已有 note 设置密码保护。
- 请求体提供 `public: true` 且存在密码时，设置为公开保护：访问不需要密码，编辑需要密码。
- 复用现有 key 校验、密码哈希校验、AES-GCM 加密存储逻辑。

## Impact
- Affected specs: note-api
- Affected code: `src/routes/api.ts`, `src/db/queries.ts`（如需复用 helper）, `tests/`
- Database: 无结构变更
