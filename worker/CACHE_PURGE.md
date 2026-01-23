# Cloudflare 缓存清理指南

部署后如果发现更新未生效,可能是由于 Cloudflare CDN 缓存导致。以下是几种缓存清理方法：

## 方法1: Cloudflare Dashboard 清理 (推荐)

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 选择你的域名
3. 进入 **Caching** -> **Configuration**
4. 点击 **Purge Cache**
5. 选择 **Purge Everything** (清除所有缓存)

## 方法2: 使用 Wrangler CLI

```bash
cd worker

# 强制重新部署
wrangler deploy --force

# 查看实时日志
wrangler tail
```

## 方法3: 浏览器强制刷新

对于客户端浏览器缓存:
- **Windows**: Ctrl + Shift + R 或 Ctrl + F5
- **Mac**: Cmd + Shift + R
- **Linux**: Ctrl + Shift + R

## 快速验证

```bash
# 部署后使用无痕模式访问验证
# Chrome: Ctrl+Shift+N (Windows) / Cmd+Shift+N (Mac)
# Firefox: Ctrl+Shift+P (Windows) / Cmd+Shift+P (Mac)
```

## 缓存策略

项目已配置静态资源缓存策略 (worker/src/index.ts):
- 生产环境: 1天缓存
- 开发环境: 5分钟缓存

## 常见问题

**Q: 清除缓存后仍看到旧版本?**
A: 使用无痕模式或强制刷新(Ctrl+Shift+R)

**Q: 缓存多久生效?**
A: Cloudflare 缓存清除通常30秒内生效
