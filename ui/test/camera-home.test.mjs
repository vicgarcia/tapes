import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const { outputFiles } = await build({
    stdin: { contents: `
        import React from 'react';
        import { renderToStaticMarkup } from 'react-dom/server';
        import { MemoryRouter } from 'react-router-dom';
        import { CamerasHome } from './src/components/cameras/CamerasHome';
        export const render = () => renderToStaticMarkup(<MemoryRouter><CamerasHome /></MemoryRouter>);
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'esm', platform: 'node',
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    tsconfig: 'tsconfig.app.json',
    plugins: [{ name: 'camera-state', setup(build) {
        build.onResolve({ filter: /^@app\/hooks\/(useSnapshot|useVisibility|usePoll)$/ }, args => ({ path: args.path, namespace: 'state' }));
        build.onLoad({ filter: /.*/, namespace: 'state' }, () => ({ contents: `
            export const useSnapshot = () => globalThis.cameraState.snapshot;
            export const usePoll = () => globalThis.cameraState.cameras;
            export const useInView = () => true;
            export const usePageVisible = () => true;
        ` }));
    } }],
});
// A file module allows bundled React's Node built-ins to resolve normally.
const { writeFile, mkdtemp, rm } = await import('node:fs/promises');
const { tmpdir } = await import('node:os');
const dir = await mkdtemp(`${tmpdir()}/camera-home-`);
let render;
try {
    await writeFile(`${dir}/render.mjs`, outputFiles[0].text);
    ({ render } = await import(`${dir}/render.mjs`));
} finally {
    await rm(dir, { recursive: true, force: true });
}

test('home renders loading, error and configuration guidance without a page title', () => {
    globalThis.cameraState = { cameras: { type: 'loading' } };
    assert.equal((render().match(/is-skeleton/g) ?? []).length, 2);
    cameraState.cameras = { type: 'error' };
    assert.match(render(), /Couldn&#x27;t load cameras/);
    cameraState.cameras = { type: 'ready', data: [] };
    assert.match(render(), /No cameras yet/);
    assert.match(render(), /mediamtx.yml/);
    assert.doesNotMatch(render(), /<h1/);
});

test('tiles link to encoded names and show online, offline, missing and stale frames', () => {
    const camera = { name: 'front door', online: true, video: { width: 640, height: 360 } };
    globalThis.cameraState = { cameras: { type: 'ready', data: [camera] }, snapshot: { type: 'none' } };
    let html = render();
    assert.match(html, /href="\/cameras\/front%20door"/);
    assert.match(html, /aspect-ratio:640 \/ 360/);
    assert.match(html, /No snapshot/);
    assert.match(html, /is-online/);
    assert.match(html, /Online/);
    camera.online = false;
    html = render();
    assert.match(html, /Camera offline/);
    assert.match(html, /Offline/);
    assert.doesNotMatch(html, /No snapshot/);
    camera.video = null;
    cameraState.snapshot = { type: 'ready', snapshot: { url: 'blob:test', time: Date.now() - 120000 } };
    html = render();
    assert.match(html, /aspect-ratio:16 \/ 9/);
    assert.match(html, /Image from 2 min ago/);
    assert.match(html, /src="blob:test"/);
    cameraState.snapshot.snapshot.time = Date.now();
    assert.doesNotMatch(render(), /Image from/);
    delete globalThis.cameraState;
});
