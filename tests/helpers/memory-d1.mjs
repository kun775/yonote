// Shared in-memory D1 test double.
//
// Handles the subset of SQL used by the Worker code:
//   - notes (SELECT/INSERT/UPDATE/DELETE)
//   - lockouts (SELECT/INSERT ON CONFLICT/DELETE)
//   - rate_limits (SELECT/INSERT ON CONFLICT/UPDATE)
//
// Unknown statements default to { meta: { changes: 0 } } for safe no-ops.

class MemoryStatement {
    constructor(db, sql) {
        this.db = db;
        this.sql = sql;
        this.values = [];
    }

    bind(...values) {
        this.values = values;
        return this;
    }

    async first() {
        const { sql, values, db } = this;

        if (sql.includes('SELECT * FROM notes WHERE key = ?')) {
            return db.notes.get(values[0]) || null;
        }
        if (sql.includes('SELECT * FROM lockouts WHERE ip = ? AND note_key = ?')) {
            return db.lockouts.get(`${values[0]}:${values[1]}`) || null;
        }
        if (sql.includes('SELECT count, reset_at FROM rate_limits WHERE ip = ? AND bucket = ?')) {
            return db.rateLimits.get(`${values[0]}:${values[1]}`) || null;
        }
        return null;
    }

    async all() {
        const { sql, values, db } = this;
        if (sql.includes('FROM notes')) {
            const list = Array.from(db.notes.values());
            list.sort((a, b) => b.updated_at - a.updated_at);
            return { results: list };
        }
        return { results: [] };
    }

    async run() {
        const { sql, values, db } = this;

        if (sql.includes('INSERT INTO notes')) {
            const [key, content, createdAt, updatedAt] = values;
            db.notes.set(key, {
                id: db.nextId++,
                key,
                content,
                password: null,
                public: 0,
                encrypted: 0,
                created_at: createdAt,
                updated_at: updatedAt
            });
            return { meta: { changes: 1 } };
        }

        if (sql.includes('UPDATE notes SET')) {
            const key = values[values.length - 1];
            const note = db.notes.get(key);
            if (!note) return { meta: { changes: 0 } };

            const assignments = sql
                .slice(sql.indexOf('SET') + 3, sql.indexOf('WHERE'))
                .split(',')
                .map((item) => item.trim().split(' = ')[0]);

            assignments.forEach((field, index) => {
                note[field] = values[index];
            });
            return { meta: { changes: 1 } };
        }

        if (sql.includes('DELETE FROM notes WHERE key = ?')) {
            db.notes.delete(values[0]);
            return { meta: { changes: 1 } };
        }

        if (sql.includes('INSERT INTO lockouts')) {
            const [ip, noteKey, attempts, lockedUntil, createdAt] = values;
            db.lockouts.set(`${ip}:${noteKey}`, {
                id: db.nextLockoutId++,
                ip,
                note_key: noteKey,
                attempts,
                locked_until: lockedUntil,
                created_at: createdAt
            });
            return { meta: { changes: 1 } };
        }

        if (sql.includes('DELETE FROM lockouts WHERE ip = ? AND note_key = ?')) {
            db.lockouts.delete(`${values[0]}:${values[1]}`);
            return { meta: { changes: 1 } };
        }

        if (sql.includes('INSERT INTO rate_limits')) {
            const [ip, bucket, _count, resetAt] = values;
            db.rateLimits.set(`${ip}:${bucket}`, { count: 1, reset_at: resetAt });
            return { meta: { changes: 1 } };
        }

        if (sql.includes('UPDATE rate_limits SET count = count + 1')) {
            const key = `${values[0]}:${values[1]}`;
            const record = db.rateLimits.get(key);
            if (record) {
                record.count += 1;
            }
            return { meta: { changes: record ? 1 : 0 } };
        }

        return { meta: { changes: 0 } };
    }
}

export class MemoryD1 {
    constructor() {
        this.notes = new Map();
        this.lockouts = new Map();
        this.rateLimits = new Map();
        this.nextId = 1;
        this.nextLockoutId = 1;
    }

    prepare(sql) {
        return new MemoryStatement(this, sql);
    }

    seedNote(key, patch = {}) {
        const now = Math.floor(Date.now() / 1000);
        const base = {
            id: this.nextId++,
            key,
            content: '',
            password: null,
            public: 0,
            encrypted: 0,
            created_at: now,
            updated_at: now
        };
        this.notes.set(key, { ...base, ...patch });
        return this.notes.get(key);
    }
}

export function createTestEnv(overrides = {}) {
    return {
        DB: new MemoryD1(),
        ENCRYPTION_KEY: 'rate-limit-test-encryption',
        AUTH_SECRET: 'rate-limit-test-auth',
        ADMIN_PASSWORD: 'unused',
        ENVIRONMENT: 'test',
        ...overrides
    };
}
