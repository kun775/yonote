import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppEnv } from '../types';
import { getNoteByKey, createNote, updateNote, deleteNote } from '../db/queries';
import { encryptContent, decryptContent, hashPassword, isLegacyPasswordHash, verifyPassword, generateKey } from '../services/crypto';
import { buildMarkdownPdf } from '../services/pdf';
import { isAuthenticated, setAuthenticated } from '../middleware/auth';
import {
    beginPasswordAttempt,
    checkNoteCreateLimit,
    checkWriteRateLimit,
    clearFailedAttempts,
    LOCKOUT_DURATION,
    MAX_NOTE_CONTENT_BYTES,
    type PasswordAttempt
} from '../middleware/rateLimit';
import { ViewPage } from '../views/note/view';
import { PasswordPage } from '../views/note/password';
import { isValidKey, safeRedirectPath } from '../utils/validation';

export const noteRoutes = new Hono<AppEnv>();

// /:key/xxx 子路由（保存、验证、删除、下载）统一校验 key，避免写入 GET /:key 访问不到的非法 key。
// 注意不能写成 '/:key/*'：Hono 的通配也会命中 '/:key'，会改变 GET /:key 遇到非法 key 时重定向首页的行为
noteRoutes.use('/:key/:action', async (c, next) => {
    if (!isValidKey(c.req.param('key'))) {
        return c.text('Not Found', 404);
    }
    await next();
});

function lockedMessage(remainingSeconds: number): string {
    return `由于多次密码错误，请等待${remainingSeconds}秒后再试`;
}

function failedAttemptMessage(attempt: PasswordAttempt): string {
    return attempt.attemptsRemaining === 0
        ? '由于多次密码错误，请等待30分钟后再试'
        : `密码错误，还有${attempt.attemptsRemaining}次尝试机会`;
}

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
        if (key.includes('.')) {
            return c.text('Not Found', 404);
        }
        return c.redirect('/');
    }

    let note = await getNoteByKey(c.env.DB, key);

    // 如果笔记不存在，不创建记录，只显示空编辑页面
    if (!note) {
        await setAuthenticated(c, key);
        const baseUrl = new URL(c.req.url).origin;
        c.header('Cache-Control', 'no-store');
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
    const authenticated = await isAuthenticated(c, key, note.password);

    if (note.password && !authenticated) {
        // 受保护笔记（有密码但公开）：未认证时默认预览模式
        if (note.public) {
            const baseUrl = new URL(c.req.url).origin;
            c.header('Cache-Control', 'no-store');
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
    c.header('Cache-Control', 'no-store');
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
    const nextUrl = safeRedirectPath(formData['next_url'], `/${key}`);

    const note = await getNoteByKey(c.env.DB, key);
    if (!note) return c.redirect('/');

    const attempt = await beginPasswordAttempt(c, key);
    if (!attempt.allowed) {
        return c.html(
            <PasswordPage
                noteKey={key}
                isPublic={false}
                error={lockedMessage(attempt.remaining)}
            />
        );
    }

    const isValid = await verifyPassword(password, note.password || '');

    if (isValid) {
        await clearFailedAttempts(c, key);
        let passwordHash = note.password;
        if (passwordHash && isLegacyPasswordHash(passwordHash)) {
            passwordHash = await hashPassword(password);
            await updateNote(c.env.DB, key, { password: passwordHash });
        }
        await setAuthenticated(c, key, passwordHash);
        return c.redirect(nextUrl);
    }

    const errorMsg = failedAttemptMessage(attempt);

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

    if (new TextEncoder().encode(content).length > MAX_NOTE_CONTENT_BYTES) {
        return c.json({ status: 'error', message: `笔记内容超出上限 ${MAX_NOTE_CONTENT_BYTES} 字节` }, 413);
    }

    const rateLimit = await checkWriteRateLimit(c, 'note:auto-save');
    if (!rateLimit.allowed) {
        c.header('Retry-After', String(rateLimit.retryAfter));
        return c.json({ status: 'error', message: `写入过于频繁，请等待 ${rateLimit.retryAfter} 秒后再试` }, 429);
    }

    let note = await getNoteByKey(c.env.DB, key);

    // 如果笔记不存在，先创建
    if (!note) {
        const createLimit = await checkNoteCreateLimit(c);
        if (!createLimit.allowed) {
            c.header('Retry-After', String(createLimit.retryAfter));
            return c.json({ status: 'error', message: `新建笔记过于频繁，请等待 ${createLimit.retryAfter} 秒后再试` }, 429);
        }

        await createNote(c.env.DB, key);
        note = await getNoteByKey(c.env.DB, key);
        if (!note) {
            return c.json({ status: 'error', message: '创建笔记失败' }, 500);
        }
    }

    const authenticated = await isAuthenticated(c, key, note.password);
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

    if (new TextEncoder().encode(content).length > MAX_NOTE_CONTENT_BYTES) {
        const errorMsg = `笔记内容超出上限 ${MAX_NOTE_CONTENT_BYTES} 字节`;
        return c.redirect(`/${key}?error=${encodeURIComponent(errorMsg)}`);
    }

    const rateLimit = await checkWriteRateLimit(c, 'note:update');
    if (!rateLimit.allowed) {
        const errorMsg = `写入过于频繁，请等待 ${rateLimit.retryAfter} 秒后再试`;
        c.header('Retry-After', String(rateLimit.retryAfter));
        return c.redirect(`/${key}?error=${encodeURIComponent(errorMsg)}`);
    }

    // 如果内容为空且没有设置密码，删除笔记；删除同样需要通过受保护笔记的鉴权
    if (!trimmedContent && passwordAction !== 'change') {
        const note = await getNoteByKey(c.env.DB, key);
        if (note) {
            if (note.password && !(await isAuthenticated(c, key, note.password))) {
                return c.redirect(`/${key}`);
            }
            await deleteNote(c.env.DB, key);
        }
        return c.redirect('/');
    }

    let note = await getNoteByKey(c.env.DB, key);

    // 如果笔记不存在，先创建
    if (!note) {
        const createLimit = await checkNoteCreateLimit(c);
        if (!createLimit.allowed) {
            const errorMsg = `新建笔记过于频繁，请等待 ${createLimit.retryAfter} 秒后再试`;
            c.header('Retry-After', String(createLimit.retryAfter));
            return c.redirect(`/${key}?error=${encodeURIComponent(errorMsg)}`);
        }

        await createNote(c.env.DB, key);
        note = await getNoteByKey(c.env.DB, key);
        if (!note) return c.redirect('/');
    }

    const authenticated = await isAuthenticated(c, key, note.password);
    if (note.password && !authenticated) {
        return c.redirect(`/${key}`);
    }

    if (note.password && (passwordAction === 'remove' || passwordAction === 'change')) {
        const currentPassword = formData['current_password'] as string || '';

        if (!currentPassword) {
            return c.redirect(`/${key}?error=${encodeURIComponent('请输入当前密码')}`);
        }

        const attempt = await beginPasswordAttempt(c, key);
        if (!attempt.allowed) {
            return c.redirect(`/${key}?error=${encodeURIComponent(lockedMessage(attempt.remaining))}`);
        }

        const isValid = await verifyPassword(currentPassword, note.password);
        if (!isValid) {
            return c.redirect(`/${key}?error=${encodeURIComponent(failedAttemptMessage(attempt))}`);
        }

        await clearFailedAttempts(c, key);
        if (isLegacyPasswordHash(note.password)) {
            note.password = await hashPassword(currentPassword);
            await updateNote(c.env.DB, key, { password: note.password });
        }
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

    if (updatedPassword) {
        await setAuthenticated(c, key, updatedPassword);
    }

    return c.redirect(`/${key}`);
});

noteRoutes.post('/:key/delete', async (c) => {
    const key = c.req.param('key');
    const note = await getNoteByKey(c.env.DB, key);

    if (!note) return c.redirect('/');

    const authenticated = await isAuthenticated(c, key, note.password);
    if (note.password && !authenticated) {
        return c.redirect(`/${key}`);
    }

    await deleteNote(c.env.DB, key);
    return c.redirect('/');
});

// 删除、下载前的密码验证共用同一逻辑：验证通过后写入笔记授权 Cookie
async function verifyNotePasswordJson(c: Context<AppEnv>) {
    const key = c.req.param('key') as string;
    const body = await c.req.json<{ password?: unknown }>();
    const password = typeof body.password === 'string' ? body.password : '';
    const note = await getNoteByKey(c.env.DB, key);

    if (!note) {
        return c.json({ success: false, message: '笔记不存在' });
    }

    if (!note.password) {
        return c.json({ success: true });
    }

    const attempt = await beginPasswordAttempt(c, key);
    if (!attempt.allowed) {
        return c.json({ success: false, message: lockedMessage(attempt.remaining) });
    }

    const isValid = await verifyPassword(password, note.password);
    if (isValid) {
        await clearFailedAttempts(c, key);
        let passwordHash = note.password;
        if (isLegacyPasswordHash(passwordHash)) {
            passwordHash = await hashPassword(password);
            await updateNote(c.env.DB, key, { password: passwordHash });
        }
        await setAuthenticated(c, key, passwordHash);
        return c.json({ success: true });
    }

    const errorMsg = attempt.attemptsRemaining === 0 ? lockedMessage(LOCKOUT_DURATION) : '密码错误';
    return c.json({ success: false, message: errorMsg });
}

noteRoutes.post('/:key/verify-delete', verifyNotePasswordJson);
noteRoutes.post('/:key/verify-download', verifyNotePasswordJson);

noteRoutes.get('/:key/download', async (c) => {
    const key = c.req.param('key');
    const format = (c.req.query('format') || 'txt').toLowerCase();
    const note = await getNoteByKey(c.env.DB, key);

    if (!note) return c.notFound();

    const authenticated = await isAuthenticated(c, key, note.password);

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
            'Content-Disposition': `attachment; filename="${key}.txt"`,
            'Cache-Control': 'no-store'
        }
    });
});
