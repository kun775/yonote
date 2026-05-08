import test from 'node:test';
import assert from 'node:assert/strict';

import { encryptContent, generateKey } from '../src/services/crypto.ts';

test('generateKey 默认生成 12 位 key', () => {
    const key = generateKey();

    assert.equal(key.length, 12);
    assert.match(key, /^[a-z]+$/);
});

test('encryptContent 在缺少加密密钥时拒绝继续执行', async () => {
    await assert.rejects(
        () => encryptContent('hello', ''),
        /ENCRYPTION_KEY/
    );
});
