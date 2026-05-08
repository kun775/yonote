-- YoNote D1 数据库 Schema

-- 笔记表
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    password TEXT,
    public INTEGER DEFAULT 0,
    encrypted INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 锁定表（密码错误次数限制）
CREATE TABLE IF NOT EXISTS lockouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    note_key TEXT NOT NULL,
    attempts INTEGER DEFAULT 0,
    locked_until INTEGER,
    created_at INTEGER NOT NULL,
    UNIQUE(ip, note_key)
);

-- 管理员会话表
CREATE TABLE IF NOT EXISTS admin_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_notes_key ON notes(key);
CREATE INDEX IF NOT EXISTS idx_lockouts_ip_key ON lockouts(ip, note_key);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);
