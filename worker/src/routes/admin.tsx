import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { getNoteByKey, deleteNote, deleteEmptyNotes, listNotes, getNoteStats } from '../db/queries';
import { decryptContent, hashPassword } from '../services/crypto';
import { isAdminAuthenticated, createAdminSession, destroyAdminSession, verifyAdminPassword } from '../middleware/session';
import { adminAuthMiddleware } from '../middleware/session';
import { AdminLoginPage } from '../views/admin/login';
import { DashboardPage } from '../views/admin/dashboard';
import { NotesListPage, NoteDetailPage } from '../views/admin/notes';

export const adminRoutes = new Hono<AppEnv>();

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

    const isValid = await verifyAdminPassword(password, c.env.ADMIN_PASSWORD);

    if (isValid) {
        await createAdminSession(c);
        return c.redirect('/admin/dashboard');
    }

    return c.html(<AdminLoginPage error="密码错误" />);
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
    const password = c.req.query('password');
    if (!password) {
        return c.text('Usage: /admin/setup?password=your_password', 400);
    }

    const hash = await hashPassword(password);
    return c.text(`请将以下哈希值设置为 ADMIN_PASSWORD secret:\n\n${hash}\n\n使用命令: wrangler secret put ADMIN_PASSWORD`);
});
