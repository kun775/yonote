import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppEnv } from '../types';
import type { Note } from '../db/queries';
import { createNote, getNoteByKey, updateNote } from '../db/queries';
import { isAuthenticated } from '../middleware/auth';
import {
    checkWriteRateLimit,
    clearFailedAttempts,
    isLockedOut,
    MAX_NOTE_CONTENT_BYTES,
    recordFailedAttempt
} from '../middleware/rateLimit';
import { decryptContent, encryptContent, hashPassword, isLegacyPasswordHash, verifyPassword } from '../services/crypto';
import { isValidKey } from '../utils/validation';

export const apiRoutes = new Hono<AppEnv>();

interface NoteWritePayload {
    content?: unknown;
    append?: unknown;
    password?: unknown;
    public?: unknown;
}

function jsonError(c: Context<AppEnv>, status: 400 | 403 | 404 | 413 | 429 | 500, message: string) {
    return c.json({ status: 'error', message }, status);
}

// decryptNoteContent 解密 note 内容
//
// 参数:
//   - note Note: 数据库中的 note 记录
//   - encryptionKey string: 内容加密密钥
//
// 元数据:
//   - 作者: VitaHuang
//   - 创建时间: 2026-05-08
//   - 更新时间: 2026-05-08
//   - 更新内容: 初始化 API note 内容解密逻辑。
async function decryptNoteContent(note: Note, encryptionKey: string): Promise<string> {
    if (!note.encrypted) {
        return note.content;
    }
    return decryptContent(note.content, encryptionKey);
}

// verifyNoteHeaderPassword 校验 API 请求头中的 note 密码
//
// 参数:
//   - note Note: 数据库中的 note 记录
//   - password string | undefined: x-admin-auth 请求头密码
//
// 元数据:
//   - 作者: VitaHuang
//   - 创建时间: 2026-05-08
//   - 更新时间: 2026-05-08
//   - 更新内容: 初始化第三方 API 密码头校验逻辑。
async function verifyNoteHeaderPassword(
    c: Context<AppEnv>,
    note: Note,
    password: string | undefined
): Promise<{ authorized: boolean; locked: boolean; remaining: number }> {
    if (!note.password) {
        return { authorized: true, locked: false, remaining: 0 };
    }
    if (!password) {
        return { authorized: false, locked: false, remaining: 0 };
    }

    const lockoutStatus = await isLockedOut(c, note.key);
    if (lockoutStatus.locked) {
        return { authorized: false, locked: true, remaining: lockoutStatus.remaining };
    }

    const valid = await verifyPassword(password, note.password);
    if (!valid) {
        const result = await recordFailedAttempt(c, note.key);
        return {
            authorized: false,
            locked: result.locked,
            remaining: result.locked ? 30 * 60 : 0
        };
    }

    await clearFailedAttempts(c, note.key);
    if (isLegacyPasswordHash(note.password)) {
        await updateNote(c.env.DB, note.key, {
            password: await hashPassword(password)
        });
    }
    return { authorized: true, locked: false, remaining: 0 };
}

async function rejectLockedApiRequest(c: Context<AppEnv>, note: Note) {
    const lockoutStatus = await isLockedOut(c, note.key);
    if (!lockoutStatus.locked) return null;
    return jsonError(c, 429, `由于多次密码错误，请等待${lockoutStatus.remaining}秒后再试`);
}

function formatNoteResponse(note: Note, content: string) {
    return {
        status: 'success',
        note: {
            key: note.key,
            content,
            public: Boolean(note.public),
            hasPassword: Boolean(note.password),
            encrypted: Boolean(note.encrypted),
            createdAt: note.created_at,
            updatedAt: note.updated_at
        },
    };
}

apiRoutes.get('/health', (c) => {
    return c.json({
        status: 'ok',
        timestamp: Date.now(),
        environment: c.env.ENVIRONMENT
    });
});

apiRoutes.get('/notes/:key', async (c) => {
    const key = c.req.param('key');

    if (!isValidKey(key)) {
        return jsonError(c, 400, '无效的笔记 key');
    }

    const note = await getNoteByKey(c.env.DB, key);
    if (!note) {
        return jsonError(c, 404, '笔记不存在');
    }

    if (note.password && !note.public) {
        const lockedResponse = await rejectLockedApiRequest(c, note);
        if (lockedResponse) return lockedResponse;

        const headerPassword = c.req.header('x-admin-auth');
        const authResult = await verifyNoteHeaderPassword(c, note, headerPassword);
        const browserAuthorized = await isAuthenticated(c, key, note.password);
        if (authResult.locked) {
            return jsonError(c, 429, `由于多次密码错误，请等待${authResult.remaining}秒后再试`);
        }
        if (!authResult.authorized && !browserAuthorized) {
            return jsonError(c, 403, '密码错误或缺少访问权限');
        }
    }

    try {
        const content = await decryptNoteContent(note, c.env.ENCRYPTION_KEY);
        c.header('Cache-Control', 'no-store');
        return c.json(formatNoteResponse(note, content));
    } catch {
        return jsonError(c, 500, '笔记解密失败');
    }
});

apiRoutes.post('/notes/:key', async (c) => {
    const key = c.req.param('key');

    if (!isValidKey(key)) {
        return jsonError(c, 400, '无效的笔记 key');
    }

    const rateLimit = await checkWriteRateLimit(c, 'api:write');
    if (!rateLimit.allowed) {
        c.header('Retry-After', String(rateLimit.retryAfter));
        return jsonError(c, 429, `写入过于频繁，请等待 ${rateLimit.retryAfter} 秒后再试`);
    }

    let body: NoteWritePayload;
    try {
        body = await c.req.json<NoteWritePayload>();
    } catch {
        return jsonError(c, 400, '请求体必须是 JSON');
    }

    if (typeof body.content !== 'string') {
        return jsonError(c, 400, 'content 必须是字符串');
    }

    const contentByteLength = new TextEncoder().encode(body.content).length;
    if (contentByteLength > MAX_NOTE_CONTENT_BYTES) {
        return jsonError(c, 413, `笔记内容超出上限 ${MAX_NOTE_CONTENT_BYTES} 字节`);
    }

    let note = await getNoteByKey(c.env.DB, key);
    if (note) {
        if (note.password) {
            const lockedResponse = await rejectLockedApiRequest(c, note);
            if (lockedResponse) return lockedResponse;
        }

        const authResult = await verifyNoteHeaderPassword(c, note, c.req.header('x-admin-auth'));
        if (authResult.locked) {
            return jsonError(c, 429, `由于多次密码错误，请等待${authResult.remaining}秒后再试`);
        }
        if (!authResult.authorized) {
            return jsonError(c, 403, '密码错误或缺少编辑权限');
        }
    } else {
        note = await createNote(c.env.DB, key);
    }

    let content = body.content;
    if (body.append === true && note.content) {
        try {
            content = `${await decryptNoteContent(note, c.env.ENCRYPTION_KEY)}${body.content}`;
        } catch {
            return jsonError(c, 500, '笔记解密失败');
        }
    }

    const updateData: {
        content: string;
        encrypted: number;
        password?: string | null;
        public?: number;
    } = {
        content: await encryptContent(content, c.env.ENCRYPTION_KEY),
        encrypted: 1
    };

    if (typeof body.password === 'string' && body.password) {
        const passwordUnchanged = note.password
            ? await verifyPassword(body.password, note.password)
            : false;
        updateData.password = passwordUnchanged ? note.password : await hashPassword(body.password);
        updateData.public = body.public === true ? 1 : 0;
    } else if (note.password && typeof body.public === 'boolean') {
        updateData.public = body.public ? 1 : 0;
    }

    await updateNote(c.env.DB, key, updateData);

    const updatedNote = await getNoteByKey(c.env.DB, key);
    if (!updatedNote) {
        return jsonError(c, 500, '保存笔记失败');
    }

    return c.json({
        status: 'success',
        message: '保存成功',
        key: updatedNote.key,
        public: Boolean(updatedNote.public),
        hasPassword: Boolean(updatedNote.password),
        encrypted: Boolean(updatedNote.encrypted),
        createdAt: updatedNote.created_at,
        updatedAt: updatedNote.updated_at
    });
});
