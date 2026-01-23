import { Hono } from 'hono';
import type { AppEnv } from './types';
import { noteRoutes } from './routes/note';
import { apiRoutes } from './routes/api';
import { adminRoutes } from './routes/admin';

const app = new Hono<AppEnv>();

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

export default app;
