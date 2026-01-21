import { Hono } from 'hono';
import type { AppEnv } from './types';
import { noteRoutes } from './routes/note';
import { apiRoutes } from './routes/api';
import { adminRoutes } from './routes/admin';

const app = new Hono<AppEnv>();

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
