import { Hono } from 'hono';
import type { AppEnv, Bindings } from './types';
import { cleanupExpiredRecords } from './db/queries';
import { LOCKOUT_DURATION } from './middleware/rateLimit';
import { noteRoutes } from './routes/note';
import { apiRoutes } from './routes/api';
import { adminRoutes } from './routes/admin';

const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-Frame-Options', 'DENY');
    c.header('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
        "img-src 'self' data: https:",
        "font-src 'self' data: https://cdnjs.cloudflare.com",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'"
    ].join('; '));
});

// 静态资源缓存控制
app.use('/static/*', async (c, next) => {
    await next();
    // 生产环境设置较长缓存时间,开发环境设置短缓存
    const cacheTime = c.env.ENVIRONMENT === 'production' ? 86400 : 300; // 生产1天,开发5分钟
    c.header('Cache-Control', `public, max-age=${cacheTime}`);
});

// Static files are served automatically by Wrangler [assets] configuration

app.route('/api', apiRoutes);
app.route('/admin', adminRoutes);
app.route('/', noteRoutes);

app.onError((err, c) => {
    console.error('Error:', err);
    return c.text('Internal Server Error', 500);
});

app.notFound((c) => {
    const path = new URL(c.req.url).pathname;
    // 静态资源 404 返回 404，不重定向
    if (path.startsWith('/static/') || path.includes('.')) {
        return c.text('Not Found', 404);
    }
    return c.redirect('/');
});

// 定时清理过期的会话、锁定与限流记录（cron 见 wrangler.toml 的 [triggers]）
async function runScheduledCleanup(env: Bindings): Promise<void> {
    const result = await cleanupExpiredRecords(env.DB, LOCKOUT_DURATION);
    console.log(
        `定时清理完成: admin_sessions=${result.adminSessions} lockouts=${result.lockouts} rate_limits=${result.rateLimits}`
    );
}

export { app };

export default {
    fetch: app.fetch,
    scheduled(_controller: ScheduledController, env: Bindings, ctx: ExecutionContext) {
        ctx.waitUntil(runScheduledCleanup(env));
    }
} satisfies ExportedHandler<Bindings>;
