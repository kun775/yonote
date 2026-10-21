import test from 'node:test';
import assert from 'node:assert/strict';

import { hashPassword } from '../src/services/crypto.ts';
import { createTestEnv } from './helpers/memory-d1.mjs';
import { SqliteD1 } from './helpers/sqlite-d1.mjs';
import { loadModule } from './helpers/load-module.mjs';

const { beginPasswordAttempt, clearFailedAttempts, isLockedOut } = await loadModule('src/middleware/rateLimit.ts');
const { noteRoutes } = await loadModule('src/routes/note.tsx');

function createContext(db, ip) {
    return {
        env: { DB: db },
        req: { header: (name) => (name === 'CF-Connecting-IP' ? ip : undefined) }
    };
}

test('同一 IP 在窗口内最多放行 5 次尝试，第 6 次起拒绝', async () => {
    const db = new SqliteD1();
    const c = createContext(db, '203.0.113.1');

    const remaining = [];
    for (let i = 0; i < 5; i++) {
        const attempt = await beginPasswordAttempt(c, 'note-x');
        assert.equal(attempt.allowed, true, `第 ${i + 1} 次应放行`);
        remaining.push(attempt.attemptsRemaining);
    }
    assert.deepEqual(remaining, [4, 3, 2, 1, 0]);

    const sixth = await beginPasswordAttempt(c, 'note-x');
    assert.equal(sixth.allowed, false);
    assert.ok(sixth.remaining > 0 && sixth.remaining <= 30 * 60);
    assert.equal((await isLockedOut(c, 'note-x')).locked, true);

    // 其他 IP 不受单 IP 锁影响
    const other = await beginPasswordAttempt(createContext(db, '203.0.113.2'), 'note-x');
    assert.equal(other.allowed, true);
});

test('跨 IP 的全局上限：同一目标第 21 次尝试被拒绝', async () => {
    const db = new SqliteD1();

    for (let i = 0; i < 20; i++) {
        const attempt = await beginPasswordAttempt(createContext(db, `198.51.100.${i}`), 'note-g');
        assert.equal(attempt.allowed, true, `第 ${i + 1} 个 IP 应放行`);
    }

    const freshIp = createContext(db, '192.0.2.99');
    const blocked = await beginPasswordAttempt(freshIp, 'note-g');
    assert.equal(blocked.allowed, false);
    assert.equal((await isLockedOut(freshIp, 'note-g')).locked, true);

    // 全局锁只针对该目标
    assert.equal((await beginPasswordAttempt(freshIp, 'note-other')).allowed, true);
});

test('校验成功后清除单 IP 与全局计数', async () => {
    const db = new SqliteD1();
    const c = createContext(db, '203.0.113.5');

    for (let i = 0; i < 4; i++) {
        await beginPasswordAttempt(c, 'note-c');
    }
    await clearFailedAttempts(c, 'note-c');

    assert.deepEqual(db.rows("SELECT * FROM lockouts WHERE note_key = 'note-c'"), []);
    assert.equal((await beginPasswordAttempt(c, 'note-c')).attemptsRemaining, 4);
});

test('计数窗口过期或锁定到期后重新计数', async () => {
    const db = new SqliteD1();
    const c = createContext(db, '203.0.113.6');

    for (let i = 0; i < 3; i++) {
        await beginPasswordAttempt(c, 'note-w');
    }
    db.exec("UPDATE lockouts SET created_at = created_at - 3600 WHERE note_key = 'note-w'");
    assert.equal((await beginPasswordAttempt(c, 'note-w')).attemptsRemaining, 4, '窗口过期后应从 1 重新计数');

    for (let i = 0; i < 5; i++) {
        await beginPasswordAttempt(c, 'note-w');
    }
    assert.equal((await beginPasswordAttempt(c, 'note-w')).allowed, false);

    db.exec("UPDATE lockouts SET locked_until = locked_until - 3600 WHERE note_key = 'note-w'");
    const afterUnlock = await beginPasswordAttempt(c, 'note-w');
    assert.equal(afterUnlock.allowed, true);
    assert.equal(afterUnlock.attemptsRemaining, 4);
});

test('并发错误密码请求最多只有 5 个进入密码校验', async () => {
    const env = createTestEnv({ DB: new SqliteD1() });
    const hash = await hashPassword('right-password');
    env.DB.prepare(
        'INSERT INTO notes (key, content, password, public, encrypted, created_at, updated_at) VALUES (?, ?, ?, 0, 0, 0, 0)'
    ).bind('racenote', 'secret', hash).run();

    const responses = await Promise.all(Array.from({ length: 12 }, () => noteRoutes.request('/racenote/verify', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'CF-Connecting-IP': '203.0.113.50'
        },
        body: 'password=wrong'
    }, env)));

    const bodies = await Promise.all(responses.map((response) => response.text()));
    const evaluated = bodies.filter((body) => body.includes('还有') || body.includes('请等待30分钟后再试'));
    const rejected = bodies.filter((body) => /请等待\d+秒后再试/.test(body));

    assert.equal(evaluated.length, 5, '只有占到尝试次数的请求才会校验密码');
    assert.equal(rejected.length, 7);
});
