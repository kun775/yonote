import type { D1Database } from '@cloudflare/workers-types';

export interface Note {
    id: number;
    key: string;
    content: string;
    password: string | null;
    public: number;
    encrypted: number;
    created_at: number;
    updated_at: number;
}

export interface Lockout {
    id: number;
    ip: string;
    note_key: string;
    attempts: number;
    locked_until: number | null;
    created_at: number;
}

export interface AdminSession {
    id: number;
    token: string;
    created_at: number;
    expires_at: number;
}

export interface NoteUpdate {
    content?: string;
    password?: string | null;
    public?: number;
    encrypted?: number;
}

export interface ListOptions {
    page: number;
    limit: number;
    search?: string;
    filter?: 'all' | 'public' | 'private' | 'protected';
}

export interface PaginatedNotes {
    notes: Note[];
    total: number;
    page: number;
    totalPages: number;
}

export interface Stats {
    total: number;
    public: number;
    private: number;
    protected: number;
    empty: number;
    recentNotes: Note[];
}

export async function getNoteByKey(db: D1Database, key: string): Promise<Note | null> {
    const result = await db.prepare('SELECT * FROM notes WHERE key = ?').bind(key).first<Note>();
    return result || null;
}

export async function createNote(db: D1Database, key: string): Promise<Note> {
    const now = Math.floor(Date.now() / 1000);
    await db.prepare(
        'INSERT INTO notes (key, content, public, created_at, updated_at, encrypted) VALUES (?, ?, 0, ?, ?, 0)'
    ).bind(key, '', now, now).run();

    const note = await getNoteByKey(db, key);
    if (!note) throw new Error('Failed to create note');
    return note;
}

export async function updateNote(db: D1Database, key: string, data: NoteUpdate): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const updates: string[] = ['updated_at = ?'];
    const values: (string | number | null)[] = [now];

    if (data.content !== undefined) {
        updates.push('content = ?');
        values.push(data.content);
    }
    if (data.password !== undefined) {
        updates.push('password = ?');
        values.push(data.password);
    }
    if (data.public !== undefined) {
        updates.push('public = ?');
        values.push(data.public);
    }
    if (data.encrypted !== undefined) {
        updates.push('encrypted = ?');
        values.push(data.encrypted);
    }

    values.push(key);
    await db.prepare(`UPDATE notes SET ${updates.join(', ')} WHERE key = ?`).bind(...values).run();
}

export async function deleteNote(db: D1Database, key: string): Promise<void> {
    await db.prepare('DELETE FROM notes WHERE key = ?').bind(key).run();
}

export async function deleteEmptyNotes(db: D1Database): Promise<number> {
    const result = await db.prepare("DELETE FROM notes WHERE TRIM(content) = '' OR content IS NULL").run();
    return result.meta.changes || 0;
}

export async function listNotes(db: D1Database, options: ListOptions): Promise<PaginatedNotes> {
    const { page, limit, search, filter } = options;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    const params: (string | number)[] = [];

    if (search) {
        // 转义 LIKE 通配符，避免用户输入的 % / _ / \ 影响匹配或引发全表扫描
        const escaped = search.replace(/[\\%_]/g, (char) => `\\${char}`);
        whereClause += " AND (key LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\')";
        params.push(`%${escaped}%`, `%${escaped}%`);
    }

    if (filter === 'public') {
        whereClause += ' AND password IS NULL';
    } else if (filter === 'private') {
        whereClause += ' AND password IS NOT NULL AND public = 0';
    } else if (filter === 'protected') {
        whereClause += ' AND password IS NOT NULL AND public = 1';
    }

    const countResult = await db.prepare(
        `SELECT COUNT(*) as count FROM notes WHERE ${whereClause}`
    ).bind(...params).first<{ count: number }>();
    const total = countResult?.count || 0;

    const notesResult = await db.prepare(
        `SELECT * FROM notes WHERE ${whereClause} ORDER BY updated_at DESC LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all<Note>();

    return {
        notes: notesResult.results || [],
        total,
        page,
        totalPages: Math.ceil(total / limit)
    };
}

export async function getNoteStats(db: D1Database): Promise<Stats> {
    const totalResult = await db.prepare('SELECT COUNT(*) as count FROM notes').first<{ count: number }>();
    const publicResult = await db.prepare('SELECT COUNT(*) as count FROM notes WHERE password IS NULL').first<{ count: number }>();
    const privateResult = await db.prepare('SELECT COUNT(*) as count FROM notes WHERE password IS NOT NULL AND public = 0').first<{ count: number }>();
    const protectedResult = await db.prepare('SELECT COUNT(*) as count FROM notes WHERE password IS NOT NULL AND public = 1').first<{ count: number }>();
    const emptyResult = await db.prepare("SELECT COUNT(*) as count FROM notes WHERE TRIM(content) = '' OR content IS NULL").first<{ count: number }>();

    const recentResult = await db.prepare(
        'SELECT * FROM notes ORDER BY updated_at DESC LIMIT 10'
    ).all<Note>();

    return {
        total: totalResult?.count || 0,
        public: publicResult?.count || 0,
        private: privateResult?.count || 0,
        protected: protectedResult?.count || 0,
        empty: emptyResult?.count || 0,
        recentNotes: recentResult.results || []
    };
}

// Lockout functions
export async function getLockout(db: D1Database, ip: string, noteKey: string): Promise<Lockout | null> {
    const result = await db.prepare(
        'SELECT * FROM lockouts WHERE ip = ? AND note_key = ?'
    ).bind(ip, noteKey).first<Lockout>();
    return result || null;
}

export interface LockoutCounter {
    attempts: number;
    locked_until: number | null;
}

// 计数窗口已过（未锁定且首次失败早于 windowStart）或锁定已到期时，计数从 1 重新开始
const LOCKOUT_EXPIRED = '((locked_until IS NOT NULL AND locked_until <= ?5) OR (locked_until IS NULL AND created_at <= ?6))';

// incrementLockout 用单条 UPSERT 原子地记一次密码尝试，并返回累加后的计数。
// 计数达到 maxAttempts 的那一次会写入 locked_until；并发请求各自拿到不同的计数，不会多放行。
export async function incrementLockout(
    db: D1Database,
    ip: string,
    noteKey: string,
    maxAttempts: number,
    windowSeconds: number,
    lockSeconds: number
): Promise<LockoutCounter> {
    const now = Math.floor(Date.now() / 1000);
    const result = await db.prepare(`
        INSERT INTO lockouts (ip, note_key, attempts, locked_until, created_at)
        VALUES (?1, ?2, 1, CASE WHEN 1 >= ?3 THEN ?4 ELSE NULL END, ?5)
        ON CONFLICT(ip, note_key) DO UPDATE SET
            attempts = CASE WHEN ${LOCKOUT_EXPIRED} THEN 1 ELSE attempts + 1 END,
            locked_until = CASE
                WHEN ${LOCKOUT_EXPIRED} THEN CASE WHEN 1 >= ?3 THEN ?4 ELSE NULL END
                WHEN locked_until IS NULL AND attempts + 1 >= ?3 THEN ?4
                ELSE locked_until
            END,
            created_at = CASE WHEN ${LOCKOUT_EXPIRED} THEN ?5 ELSE created_at END
        RETURNING attempts, locked_until
    `).bind(ip, noteKey, maxAttempts, now + lockSeconds, now, now - windowSeconds).first<LockoutCounter>();

    if (!result) {
        throw new Error('记录密码尝试失败');
    }
    return result;
}

export async function clearLockout(db: D1Database, ip: string, noteKey: string): Promise<void> {
    await db.prepare('DELETE FROM lockouts WHERE ip = ? AND note_key = ?').bind(ip, noteKey).run();
}

// Admin session functions
export async function createAdminSession(db: D1Database, token: string, expiresAt: number): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await db.prepare(
        'INSERT INTO admin_sessions (token, created_at, expires_at) VALUES (?, ?, ?)'
    ).bind(token, now, expiresAt).run();
}

export async function getAdminSession(db: D1Database, token: string): Promise<AdminSession | null> {
    const now = Math.floor(Date.now() / 1000);
    const result = await db.prepare(
        'SELECT * FROM admin_sessions WHERE token = ? AND expires_at > ?'
    ).bind(token, now).first<AdminSession>();
    return result || null;
}

export async function deleteAdminSession(db: D1Database, token: string): Promise<void> {
    await db.prepare('DELETE FROM admin_sessions WHERE token = ?').bind(token).run();
}

export async function cleanExpiredSessions(db: D1Database): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').bind(now).run();
}

export interface CleanupResult {
    adminSessions: number;
    lockouts: number;
    rateLimits: number;
}

// cleanupExpiredRecords 清理过期的会话、锁定与限流记录，由定时任务调用。
// lockouts 只删已到期的锁和超出计数窗口的未锁定记录，仍在锁定期内的保留。
export async function cleanupExpiredRecords(db: D1Database, lockoutWindowSeconds: number): Promise<CleanupResult> {
    const now = Math.floor(Date.now() / 1000);

    const sessions = await db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').bind(now).run();
    const lockouts = await db.prepare(`
        DELETE FROM lockouts
        WHERE (locked_until IS NOT NULL AND locked_until <= ?)
           OR (locked_until IS NULL AND created_at <= ?)
    `).bind(now, now - lockoutWindowSeconds).run();
    const rateLimits = await db.prepare('DELETE FROM rate_limits WHERE reset_at <= ?').bind(now).run();

    return {
        adminSessions: sessions.meta.changes || 0,
        lockouts: lockouts.meta.changes || 0,
        rateLimits: rateLimits.meta.changes || 0
    };
}

// Rate limit functions

export interface RateLimitRecord {
    count: number;
    reset_at: number;
}

export async function getRateLimit(db: D1Database, ip: string, bucket: string): Promise<RateLimitRecord | null> {
    const result = await db.prepare(
        'SELECT count, reset_at FROM rate_limits WHERE ip = ? AND bucket = ?'
    ).bind(ip, bucket).first<RateLimitRecord>();
    return result || null;
}

export async function resetRateLimit(db: D1Database, ip: string, bucket: string, resetAt: number): Promise<void> {
    await db.prepare(`
        INSERT INTO rate_limits (ip, bucket, count, reset_at) VALUES (?, ?, 1, ?)
        ON CONFLICT(ip, bucket) DO UPDATE SET count = 1, reset_at = ?
    `).bind(ip, bucket, resetAt, resetAt).run();
}

export async function incrementRateLimit(db: D1Database, ip: string, bucket: string): Promise<void> {
    await db.prepare(
        'UPDATE rate_limits SET count = count + 1 WHERE ip = ? AND bucket = ?'
    ).bind(ip, bucket).run();
}
