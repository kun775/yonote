import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('CSP 不允许内联脚本执行', () => {
    const source = fs.readFileSync('src/index.ts', 'utf8');

    assert.doesNotMatch(source, /script-src[^"]*'unsafe-inline'/);
});

test('页面模板不再使用内联脚本和内联事件处理器', () => {
    const files = [
        'src/views/layouts/base.tsx',
        'src/views/note/view.tsx',
        'src/views/admin/dashboard.tsx',
        'src/views/admin/notes.tsx'
    ];

    for (const file of files) {
        const source = fs.readFileSync(file, 'utf8');
        assert.doesNotMatch(source, /<script\s+dangerouslySetInnerHTML/);
        assert.doesNotMatch(source, /\son[a-z]+=/i);
    }
});

test('认证 cookie 使用独立 AUTH_SECRET 而不是内容加密密钥', () => {
    const source = fs.readFileSync('src/middleware/auth.ts', 'utf8');

    assert.match(source, /AUTH_SECRET/);
    assert.doesNotMatch(source, /c\.env\.ENCRYPTION_KEY\?\.trim\(\)/);
});

test('明文 note 响应设置 no-store', () => {
    const apiSource = fs.readFileSync('src/routes/api.ts', 'utf8');
    const noteSource = fs.readFileSync('src/routes/note.tsx', 'utf8');

    assert.match(apiSource, /Cache-Control['"], ['"]no-store/);
    assert.match(noteSource, /Cache-Control['"], ['"]no-store/);
});
