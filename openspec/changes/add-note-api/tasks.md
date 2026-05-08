## 1. Implementation
- [x] 1.1 为指定 note API 增加失败测试，覆盖读取不存在 note、读取公开保护 note、读取私有保护 note、密码头认证、覆盖写入、追加写入、自动创建 note、写入时设置密码保护。
- [x] 1.2 在 `src/routes/api.ts` 实现 `GET /api/notes/:key`。
- [x] 1.3 在 `src/routes/api.ts` 实现 `POST /api/notes/:key`。
- [x] 1.4 复用现有 key 校验、密码哈希校验、加密/解密逻辑，保持错误返回为 JSON。
- [x] 1.5 运行针对性测试、全量测试和 TypeScript 类型检查。
