/**
 * 生成管理员密码哈希的脚本
 * 使用方法: node scripts/generate-password-hash.js <password>
 */

const crypto = require('crypto');

const PASSWORD_ITERATIONS = 100000;
const PASSWORD_SALT_LENGTH = 16;
const PASSWORD_PREFIX = 'pbkdf2$';

function base64Encode(buffer) {
    return buffer.toString('base64');
}

async function hashPassword(password) {
    const salt = crypto.randomBytes(PASSWORD_SALT_LENGTH);
    const derived = crypto.pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, 32, 'sha256');
    return `${PASSWORD_PREFIX}${PASSWORD_ITERATIONS}$${base64Encode(salt)}$${base64Encode(derived)}`;
}

const password = process.argv[2];

if (!password) {
    console.error('用法: node scripts/generate-password-hash.js <password>');
    console.error('示例: node scripts/generate-password-hash.js mySecurePassword123');
    process.exit(1);
}

hashPassword(password).then(hash => {
    console.log('\n密码哈希已生成:');
    console.log(hash);
    console.log('\n使用以下命令设置 secret:');
    console.log(`echo "${hash}" | npx wrangler secret put ADMIN_PASSWORD`);
});
