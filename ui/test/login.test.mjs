import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const { outputFiles } = await build({
    stdin: { contents: `
        import React from 'react';
        import { renderToStaticMarkup } from 'react-dom/server';
        import { MemoryRouter } from 'react-router-dom';
        import { Login } from './src/components/Login';
        export const render = () => renderToStaticMarkup(<MemoryRouter><Login /></MemoryRouter>);
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'esm', platform: 'node',
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    tsconfig: 'tsconfig.app.json',
    plugins: [{ name: 'auth-state', setup(build) {
        build.onResolve({ filter: /^@app\/services\/auth$/ }, args => ({ path: args.path, namespace: 'state' }));
        build.onLoad({ filter: /.*/, namespace: 'state' }, () => ({ contents: `
            export const useAuth = () => ({ status: globalThis.authStatus });
            export const isBadCredentials = () => false;
        ` }));
    } }],
});
// A file module allows bundled React's Node built-ins to resolve normally.
const { writeFile, mkdtemp, rm } = await import('node:fs/promises');
const { tmpdir } = await import('node:os');
const dir = await mkdtemp(`${tmpdir()}/login-`);
let render;
try {
    await writeFile(`${dir}/render.mjs`, outputFiles[0].text);
    ({ render } = await import(`${dir}/render.mjs`));
} finally {
    await rm(dir, { recursive: true, force: true });
}

test('login keeps labeled credential fields without visible branding', () => {
    globalThis.authStatus = 'anonymous';
    const html = render();
    assert.match(html, /aria-label="Sign in"/);
    assert.match(html, /<span>Username<\/span>/);
    assert.match(html, /autoComplete="username"/);
    assert.match(html, /<span>Password<\/span>/);
    assert.match(html, /type="password"/);
    assert.match(html, /autoComplete="current-password"/);
    assert.match(html, /type="submit"[^>]*>Sign in<\/button>/);
    assert.doesNotMatch(html, /Tapes|<svg|login-brand/);
    delete globalThis.authStatus;
});

test('login stays hidden while checking the session', () => {
    globalThis.authStatus = 'checking';
    assert.equal(render(), '');
    delete globalThis.authStatus;
});
