import test from 'node:test';
import assert from 'node:assert/strict';

import { decryptContent, encryptContent, generateKey } from '../src/services/crypto.ts';

// 按旧版格式（无前缀、PBKDF2 10 万轮派生）生成密文，模拟库中的历史数据
async function encryptLegacy(content, secret) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt']
    );
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(content)));
    return Buffer.concat([salt, iv, encrypted]).toString('base64');
}

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

test('新密文带 v2 前缀，可往返解密，且每次加密结果不同', async () => {
    const content = '中文内容 & <b>markup</b>\n第二行';
    const first = await encryptContent(content, 'server-secret');
    const second = await encryptContent(content, 'server-secret');

    assert.match(first, /^v2:[A-Za-z0-9+/]+=*$/);
    assert.notEqual(first, second, '每次加密应使用随机 salt / IV');
    assert.equal(await decryptContent(first, 'server-secret'), content);
    assert.equal(await decryptContent(second, 'server-secret'), content);
});

test('历史无前缀密文（PBKDF2 派生）仍可解密', async () => {
    const legacy = await encryptLegacy('旧笔记内容', 'server-secret');

    assert.doesNotMatch(legacy, /^v2:/);
    assert.equal(await decryptContent(legacy, 'server-secret'), '旧笔记内容');
});

test('密钥错误时新旧两种密文都解密失败', async () => {
    const current = await encryptContent('x', 'server-secret');
    const legacy = await encryptLegacy('x', 'server-secret');

    await assert.rejects(() => decryptContent(current, 'other-secret'), /解密失败/);
    await assert.rejects(() => decryptContent(legacy, 'other-secret'), /解密失败/);
});

test('空内容加解密保持为空字符串', async () => {
    assert.equal(await encryptContent('', 'server-secret'), '');
    assert.equal(await decryptContent('', 'server-secret'), '');
});
