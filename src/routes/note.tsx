import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppEnv } from '../types';
import { getNoteByKey, createNote, updateNote, deleteNote } from '../db/queries';
import { encryptContent, decryptContent, hashPassword, verifyPassword, generateKey } from '../services/crypto';
import { buildMarkdownPdf } from '../services/pdf';
import { isAuthenticated, setAuthenticated } from '../middleware/auth';
import { isLockedOut, recordFailedAttempt, clearFailedAttempts } from '../middleware/rateLimit';
import { ViewPage } from '../views/note/view';
import { PasswordPage } from '../views/note/password';
import { isValidKey } from '../utils/validation';

export const noteRoutes = new Hono<AppEnv>();

async function generateAvailableKey(c: Context<AppEnv>): Promise<string> {
    for (let i = 0; i < 10; i++) {
        const key = generateKey();
        const existingNote = await getNoteByKey(c.env.DB, key);
        if (!existingNote) {
            return key;
        }
    }

    throw new Error('生成可用笔记 key 失败');
}

noteRoutes.get('/', async (c) => {
    const key = await generateAvailableKey(c);
    // 不创建数据库记录，直接重定向到新 key，等有内容时再保存
    await setAuthenticated(c, key);
    return c.redirect(`/${key}?new=1`);
});

noteRoutes.get('/:key', async (c) => {
    const key = c.req.param('key');

    if (!isValidKey(key)) {
        return c.redirect('/');
    }

    let note = await getNoteByKey(c.env.DB, key);

    // 如果笔记不存在，不创建记录，只显示空编辑页面
    if (!note) {
        await setAuthenticated(c, key);
        const baseUrl = new URL(c.req.url).origin;
        return c.html(
            <ViewPage
                note={{
                    id: 0,
                    key,
                    content: '',
                    password: null,
                    public: 0,
                    encrypted: 0,
                    created_at: Math.floor(Date.now() / 1000),
                    updated_at: Math.floor(Date.now() / 1000),
                    decryptedContent: ''
                }}
                viewOnly={false}
                authenticated={true}
                baseUrl={baseUrl}
            />
        );
    }

    let decryptedContent = '';
    if (note.encrypted && note.content) {
        try {
            decryptedContent = await decryptContent(note.content, c.env.ENCRYPTION_KEY);
        } catch {
            return c.text('笔记解密失败，请检查加密密钥配置后重试', 500);
        }
    } else {
        decryptedContent = note.content;
    }

    const viewOnly = c.req.query('view') === '1';
    const authenticated = await isAuthenticated(c, key);

    if (note.password && !authenticated) {
        // 受保护笔记（有密码但公开）：未认证时默认预览模式
        if (note.public) {
            const baseUrl = new URL(c.req.url).origin;
            return c.html(
                <ViewPage
                    note={{ ...note, decryptedContent }}
                    viewOnly={true}
                    authenticated={false}
                    baseUrl={baseUrl}
                />
            );
        }
        // 私有笔记：需要密码验证
        return c.html(<PasswordPage noteKey={key} isPublic={false} />);
    }

    const baseUrl = new URL(c.req.url).origin;
    return c.html(
        <ViewPage
            note={{ ...note, decryptedContent }}
            viewOnly={viewOnly}
            authenticated={authenticated}
            baseUrl={baseUrl}
        />
    );
});

noteRoutes.post('/:key/verify', async (c) => {
    const key = c.req.param('key');
    const formData = await c.req.parseBody();
    const password = formData['password'] as string || '';
    const nextUrl = formData['next_url'] as string || `/${key}`;

    const lockoutStatus = await isLockedOut(c, key);
    if (lockoutStatus.locked) {
        return c.html(
            <PasswordPage
                noteKey={key}
                isPublic={false}
                error={`由于多次密码错误，请等待${lockoutStatus.remaining}秒后再试`}
            />
        );
    }

    const note = await getNoteByKey(c.env.DB, key);
    if (!note) return c.redirect('/');

    const isValid = await verifyPassword(password, note.password || '');

    if (isValid) {
        await clearFailedAttempts(c, key);
        await setAuthenticated(c, key);
        return c.redirect(nextUrl);
    }

    const result = await recordFailedAttempt(c, key);
    const errorMsg = result.locked
        ? `由于多次密码错误，请等待30分钟后再试`
        : `密码错误，还有${result.attemptsRemaining}次尝试机会`;

    return c.html(
        <PasswordPage
            noteKey={key}
            isPublic={!!note.public}
            error={errorMsg}
        />
    );
});

noteRoutes.post('/:key/auto-save', async (c) => {
    const key = c.req.param('key');
    const body = await c.req.json<{ content: string }>();
    const content = body.content || '';

    let note = await getNoteByKey(c.env.DB, key);

    // 如果笔记不存在，先创建
    if (!note) {
        await createNote(c.env.DB, key);
        note = await getNoteByKey(c.env.DB, key);
        if (!note) {
            return c.json({ status: 'error', message: '创建笔记失败' }, 500);
        }
    }

    const authenticated = await isAuthenticated(c, key);
    if (note.password && !authenticated) {
        return c.json({ status: 'error', message: '未授权的操作' }, 403);
    }

    const encryptedContent = await encryptContent(content, c.env.ENCRYPTION_KEY);
    const timestamp = Math.floor(Date.now() / 1000);

    // 更新记录（即使内容为空也保留，与 Flask 版本对齐）
    await updateNote(c.env.DB, key, {
        content: encryptedContent,
        encrypted: 1
    });

    return c.json({ status: 'success', message: '自动保存成功', timestamp });
});

noteRoutes.post('/:key/update', async (c) => {
    const key = c.req.param('key');
    const formData = await c.req.parseBody();
    const content = formData['content'] as string || '';
    const trimmedContent = content.trim();
    const passwordAction = formData['password_action'] as string || 'keep';
    const newPassword = formData['new_password'] as string || '';
    let isPublic = formData['public'] ? 1 : 0;

    // 如果内容为空且没有设置密码，删除笔记
    if (!trimmedContent && passwordAction !== 'change') {
        const note = await getNoteByKey(c.env.DB, key);
        if (note) {
            await deleteNote(c.env.DB, key);
        }
        return c.redirect('/');
    }

    let note = await getNoteByKey(c.env.DB, key);

    // 如果笔记不存在，先创建
    if (!note) {
        await createNote(c.env.DB, key);
        note = await getNoteByKey(c.env.DB, key);
        if (!note) return c.redirect('/');
    }

    const authenticated = await isAuthenticated(c, key);
    if (note.password && !authenticated) {
        return c.redirect(`/${key}`);
    }

    if (note.password && (passwordAction === 'remove' || passwordAction === 'change')) {
        const currentPassword = formData['current_password'] as string || '';

        const lockoutStatus = await isLockedOut(c, key);
        if (lockoutStatus.locked) {
            const errorMsg = `由于多次密码错误，请等待${lockoutStatus.remaining}秒后再试`;
            return c.redirect(`/${key}?error=${encodeURIComponent(errorMsg)}`);
        }

        if (!currentPassword) {
            return c.redirect(`/${key}?error=${encodeURIComponent('请输入当前密码')}`);
        }

        const isValid = await verifyPassword(currentPassword, note.password);
        if (!isValid) {
            const result = await recordFailedAttempt(c, key);
            const errorMsg = result.locked
                ? '由于多次密码错误，请等待30分钟后再试'
                : `密码错误，还有${result.attemptsRemaining}次尝试机会`;
            return c.redirect(`/${key}?error=${encodeURIComponent(errorMsg)}`);
        }

        await clearFailedAttempts(c, key);
    }

    let updatedPassword: string | null = note.password;

    if (passwordAction === 'remove') {
        updatedPassword = null;
        isPublic = 0;
    } else if (passwordAction === 'change' && newPassword) {
        updatedPassword = await hashPassword(newPassword);
    }

    if (!updatedPassword) {
        isPublic = 0;
    }

    const encryptedContent = await encryptContent(content, c.env.ENCRYPTION_KEY);

    await updateNote(c.env.DB, key, {
        content: encryptedContent,
        password: updatedPassword,
        public: isPublic,
        encrypted: 1
    });

    return c.redirect(`/${key}`);
});

noteRoutes.post('/:key/delete', async (c) => {
    const key = c.req.param('key');
    const note = await getNoteByKey(c.env.DB, key);

    if (!note) return c.redirect('/');

    const authenticated = await isAuthenticated(c, key);
    if (note.password && !authenticated) {
        return c.redirect(`/${key}`);
    }

    await deleteNote(c.env.DB, key);
    return c.redirect('/');
});

noteRoutes.post('/:key/verify-delete', async (c) => {
    const key = c.req.param('key');

    const lockoutStatus = await isLockedOut(c, key);
    if (lockoutStatus.locked) {
        return c.json({ success: false, message: `由于多次密码错误，请等待${lockoutStatus.remaining}秒后再试` });
    }

    const body = await c.req.json<{ password: string }>();
    const note = await getNoteByKey(c.env.DB, key);

    if (!note) {
        return c.json({ success: false, message: '笔记不存在' });
    }

    if (!note.password) {
        return c.json({ success: true });
    }

    const isValid = await verifyPassword(body.password, note.password);
    if (isValid) {
        await clearFailedAttempts(c, key);
        await setAuthenticated(c, key);
        return c.json({ success: true });
    }

    const result = await recordFailedAttempt(c, key);
    const errorMsg = result.locked ? '由于多次密码错误，请等待30分钟后再试' : '密码错误';
    return c.json({ success: false, message: errorMsg });
});

noteRoutes.post('/:key/verify-download', async (c) => {
    const key = c.req.param('key');

    const lockoutStatus = await isLockedOut(c, key);
    if (lockoutStatus.locked) {
        return c.json({ success: false, message: `由于多次密码错误，请等待${lockoutStatus.remaining}秒后再试` });
    }

    const body = await c.req.json<{ password: string }>();
    const note = await getNoteByKey(c.env.DB, key);

    if (!note) {
        return c.json({ success: false, message: '笔记不存在' });
    }

    if (!note.password) {
        return c.json({ success: true });
    }

    const isValid = await verifyPassword(body.password, note.password);
    if (isValid) {
        await clearFailedAttempts(c, key);
        await setAuthenticated(c, key);
        return c.json({ success: true });
    }

    const result = await recordFailedAttempt(c, key);
    const errorMsg = result.locked ? '由于多次密码错误，请等待30分钟后再试' : '密码错误';
    return c.json({ success: false, message: errorMsg });
});

noteRoutes.get('/:key/download', async (c) => {
    const key = c.req.param('key');
    const format = (c.req.query('format') || 'txt').toLowerCase();
    const note = await getNoteByKey(c.env.DB, key);

    if (!note) return c.notFound();

    const authenticated = await isAuthenticated(c, key);

    if (note.password && !authenticated) {
        return c.text('需要密码验证', 403);
    }

    let content = '';
    if (note.encrypted && note.content) {
        try {
            content = await decryptContent(note.content, c.env.ENCRYPTION_KEY);
        } catch {
            return c.text('笔记解密失败，请稍后重试', 500);
        }
    } else {
        content = note.content;
    }

    if (format === 'pdf') {
        const pdfBinary = buildMarkdownPdf(content);
        return new Response(pdfBinary, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${key}.pdf"`,
                'Cache-Control': 'no-store'
            }
        });
    }

    return new Response(content, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Disposition': `attachment; filename="${key}.txt"`
        }
    });
});

noteRoutes.post('/render-markdown', async (c) => {
    try {
        const body = await c.req.json<{ content: string }>();
        const content = body.content || '';

        if (!content) {
            return c.json({ html: '' });
        }

        // Worker 版本使用客户端渲染（前端 marked + DOMPurify）
        // 服务端渲染作为未来增强功能预留
        // 当前返回原始内容，由前端处理
        return c.json({
            html: '',
            message: '请使用客户端渲染（已启用 DOMPurify 安全防护）'
        });
    } catch (error) {
        console.error('Markdown render error:', error);
        return c.json({ error: '渲染失败' }, 500);
    }
});
