import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { getNoteByKey, deleteNote, deleteEmptyNotes, listNotes, getNoteStats, cleanExpiredSessions } from '../db/queries';
import { decryptContent, hashPassword } from '../services/crypto';
import { isAdminAuthenticated, createAdminSession, destroyAdminSession, verifyAdminPassword } from '../middleware/session';
import { adminAuthMiddleware } from '../middleware/session';
import { isLockedOut, recordFailedAttempt, clearFailedAttempts } from '../middleware/rateLimit';
import { AdminLoginPage } from '../views/admin/login';
import { DashboardPage } from '../views/admin/dashboard';
import { NotesListPage, NoteDetailPage } from '../views/admin/notes';

export const adminRoutes = new Hono<AppEnv>();
const ADMIN_LOGIN_LOCKOUT_KEY = '__admin__';

adminRoutes.get('/', async (c) => {
    const isAuth = await isAdminAuthenticated(c);
    if (isAuth) {
        return c.redirect('/admin/dashboard');
    }
    return c.html(<AdminLoginPage />);
});

adminRoutes.post('/login', async (c) => {
    const formData = await c.req.parseBody();
    const password = formData['password'] as string || '';

    if (!c.env.ADMIN_PASSWORD) {
        return c.html(<AdminLoginPage error="管理密码未配置" />);
    }

    const lockoutStatus = await isLockedOut(c, ADMIN_LOGIN_LOCKOUT_KEY);
    if (lockoutStatus.locked) {
        return c.html(<AdminLoginPage error={`登录失败次数过多，请等待${lockoutStatus.remaining}秒后再试`} />);
    }

    const isValid = await verifyAdminPassword(password, c.env.ADMIN_PASSWORD);

    if (isValid) {
        await clearFailedAttempts(c, ADMIN_LOGIN_LOCKOUT_KEY);
        await cleanExpiredSessions(c.env.DB);
        await createAdminSession(c);
        return c.redirect('/admin/dashboard');
    }

    const result = await recordFailedAttempt(c, ADMIN_LOGIN_LOCKOUT_KEY);
    const error = result.locked
        ? '登录失败次数过多，请等待30分钟后再试'
        : `密码错误，还有${result.attemptsRemaining}次尝试机会`;
    return c.html(<AdminLoginPage error={error} />);
});

adminRoutes.post('/logout', async (c) => {
    await destroyAdminSession(c);
    return c.redirect('/admin');
});

adminRoutes.get('/dashboard', adminAuthMiddleware, async (c) => {
    const stats = await getNoteStats(c.env.DB);
    return c.html(<DashboardPage stats={stats} />);
});

adminRoutes.get('/notes', adminAuthMiddleware, async (c) => {
    const page = parseInt(c.req.query('page') || '1');
    const search = c.req.query('search') || undefined;
    const filter = c.req.query('filter') as 'all' | 'public' | 'private' | 'protected' | undefined;

    const notes = await listNotes(c.env.DB, {
        page,
        limit: 20,
        search,
        filter: filter || 'all'
    });

    return c.html(<NotesListPage notes={notes} search={search} filter={filter} />);
});

adminRoutes.get('/notes/:key', adminAuthMiddleware, async (c) => {
    const key = c.req.param('key');
    const note = await getNoteByKey(c.env.DB, key);

    if (!note) {
        return c.redirect('/admin/notes');
    }

    let decryptedContent: string | undefined;
    if (note.encrypted && note.content) {
        try {
            decryptedContent = await decryptContent(note.content, c.env.ENCRYPTION_KEY);
        } catch {
            decryptedContent = '[解密失败]';
        }
    }

    return c.html(<NoteDetailPage note={{ ...note, decryptedContent }} />);
});

adminRoutes.delete('/notes/:key', adminAuthMiddleware, async (c) => {
    const key = c.req.param('key');
    await deleteNote(c.env.DB, key);
    return c.json({ success: true });
});

adminRoutes.delete('/notes-empty', adminAuthMiddleware, async (c) => {
    const deleted = await deleteEmptyNotes(c.env.DB);
    return c.json({ success: true, deleted });
});

adminRoutes.get('/setup', async (c) => {
    if (c.req.query('password')) {
        return c.text('请改用表单提交密码，避免通过 URL 传递敏感信息', 400);
    }

    return c.html(
        <html lang="zh">
            <head>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>管理员密码哈希生成</title>
                <link rel="stylesheet" href="/static/style.css" />
            </head>
            <body>
                <div class="password-container">
                    <div class="password-box">
                        <div class="password-header">
                            <h2>管理员密码哈希生成</h2>
                        </div>
                        <p class="password-description">通过表单提交密码，避免在 URL、日志和历史记录中泄露明文密码。</p>
                        <form action="/admin/setup" method="post" class="password-form">
                            <div class="form-group">
                                <label for="password">管理员密码</label>
                                <input id="password" name="password" type="password" required autofocus />
                            </div>
                            <button type="submit" class="btn primary full-width">生成哈希</button>
                        </form>
                    </div>
                </div>
            </body>
        </html>
    );
});

adminRoutes.post('/setup', async (c) => {
    const formData = await c.req.parseBody();
    const password = formData['password'] as string || '';

    if (!password.trim()) {
        return c.text('密码不能为空', 400);
    }

    const hash = await hashPassword(password);
    return c.text(`请将以下哈希值设置为 ADMIN_PASSWORD secret:\n\n${hash}\n\n使用命令: wrangler secret put ADMIN_PASSWORD`);
});
