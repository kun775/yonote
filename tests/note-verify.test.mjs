import test from 'node:test';
import assert from 'node:assert/strict';

import { hashPassword } from '../src/services/crypto.ts';
import { safeRedirectPath } from '../src/utils/validation.ts';
import { MemoryD1, createTestEnv } from './helpers/memory-d1.mjs';
import { loadModule } from './helpers/load-module.mjs';

const { noteRoutes } = await loadModule('src/routes/note.tsx');

async function createEnvWithProtectedNote(key, password) {
    const env = createTestEnv({ DB: new MemoryD1() });
    env.DB.seedNote(key, { password: await hashPassword(password), content: 'secret' });
    return env;
}

function postVerify(env, key, fields, ip = '198.51.100.30') {
    return noteRoutes.request(`/${key}/verify`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'CF-Connecting-IP': ip
        },
        body: new URLSearchParams(fields).toString()
    }, env);
}

test('safeRedirectPath 只放行站内路径', () => {
    assert.equal(safeRedirectPath('/abc?view=1#h', '/fb'), '/abc?view=1#h');
    for (const value of ['https://evil.example/', '//evil.example/x', '/\\evil.example', '\\\\evil.example', 'javascript:alert(1)', '', undefined, 42]) {
        assert.equal(safeRedirectPath(value, '/fb'), '/fb', `应拒绝 ${String(value)}`);
    }
});

test('verify 成功后不会跳转到外站 next_url', async () => {
    const env = await createEnvWithProtectedNote('verifynote', 'pw-1');

    for (const nextUrl of ['https://evil.example/phish', '//evil.example/phish', '/\\evil.example']) {
        const response = await postVerify(env, 'verifynote', { password: 'pw-1', next_url: nextUrl });
        assert.equal(response.status, 302);
        assert.equal(response.headers.get('location'), '/verifynote', `next_url=${nextUrl} 应回落到笔记页`);
    }
});

test('verify 成功后保留站内 next_url', async () => {
    const env = await createEnvWithProtectedNote('verifynote2', 'pw-2');
    const response = await postVerify(env, 'verifynote2', { password: 'pw-2', next_url: '/verifynote2?view=1' });

    assert.equal(response.headers.get('location'), '/verifynote2?view=1');
});
