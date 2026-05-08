import { build } from 'esbuild';

// loadModule bundles a workspace-relative TS entry and imports it via a data URL.
// Use this when the target module re-exports symbols whose own imports rely on
// TS-resolved paths that Node's native type stripping does not follow.
export async function loadModule(entry) {
    const result = await build({
        entryPoints: [entry],
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
