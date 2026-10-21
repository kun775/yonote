// 把前端依赖从 node_modules 复制到 public/static/vendor/，由 Worker 同源提供（不走 CDN）。
// 版本由 package.json 中精确锁定的 devDependencies 决定；升级依赖后重新运行 `npm run vendor`。
// 去掉 sourceMappingURL 注释，避免浏览器请求未随附的 .map 文件。

import fs from 'node:fs';
import path from 'node:path';

const VENDOR_DIR = 'public/static/vendor';
const FILES = [
    ['node_modules/marked/lib/marked.umd.js', 'marked.umd.js'],
    ['node_modules/dompurify/dist/purify.min.js', 'purify.min.js']
];

fs.mkdirSync(VENDOR_DIR, { recursive: true });

for (const [source, target] of FILES) {
    const content = fs.readFileSync(source, 'utf8').replace(/\n?\/\/# sourceMappingURL=.*$/m, '\n');
    fs.writeFileSync(path.join(VENDOR_DIR, target), content);
    console.log(`${source} -> ${VENDOR_DIR}/${target}`);
}
