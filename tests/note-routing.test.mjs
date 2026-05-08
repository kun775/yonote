import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function loadNoteRoutes() {
    const result = await build({
        entryPoints: ['src/routes/note.tsx'],
        bundle: true,
        format: 'esm',
        platform: 'node',
        target: 'es2022',
        write: false
    });

    const source = result.outputFiles[0].text;
    const encoded = Buffer.from(source).toString('base64');
    return import(`data:text/javascript;base64,${encoded}`);
}

const { noteRoutes } = await loadNoteRoutes();

test('GET /favicon.ico 不应被当作 note key 并重定向到新笔记', async () => {
    const response = await noteRoutes.request('/favicon.ico');

    assert.equal(response.status, 404);
    assert.equal(response.headers.get('location'), null);
});
