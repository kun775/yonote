// 基于 node:sqlite 的 D1 适配器，加载真实 src/db/schema.sql。
//
// 用于验证 queries.ts 中带 UPSERT / CASE / RETURNING 的 SQL 语义；
// MemoryD1 靠字符串匹配模拟 SQL，无法证明真实 SQL 写对了。

import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

class SqliteStatement {
    constructor(db, sql) {
        this.statement = db.prepare(sql);
        this.values = [];
    }

    bind(...values) {
        this.values = values;
        return this;
    }

    async first() {
        const row = this.statement.get(...this.values);
        return row ? { ...row } : null;
    }

    async all() {
        return { results: this.statement.all(...this.values).map((row) => ({ ...row })) };
    }

    async run() {
        const result = this.statement.run(...this.values);
        return { meta: { changes: Number(result.changes) } };
    }
}

export class SqliteD1 {
    constructor() {
        this.db = new DatabaseSync(':memory:');
        this.db.exec(fs.readFileSync('src/db/schema.sql', 'utf8'));
    }

    prepare(sql) {
        return new SqliteStatement(this.db, sql);
    }

    // 测试辅助：直接执行 SQL（例如把时间戳拨回过去）
    exec(sql) {
        this.db.exec(sql);
    }

    rows(sql) {
        return this.db.prepare(sql).all().map((row) => ({ ...row }));
    }
}
