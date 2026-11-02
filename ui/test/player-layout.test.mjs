import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const { outputFiles } = await build({
    stdin: { contents: `
        import React from 'react';
        import { renderToStaticMarkup } from 'react-dom/server';
        import { MemoryRouter, Routes, Route } from 'react-router-dom';
        import CameraView from './src/components/player/CameraView';
        export const render = () => renderToStaticMarkup(<MemoryRouter initialEntries={['/cameras/test']}>
            <Routes><Route path="/cameras/:name" element={<CameraView />} /></Routes>
        </MemoryRouter>);
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'esm', platform: 'node', loader: { '.css': 'empty' },
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    tsconfig: 'tsconfig.app.json',
    plugins: [{ name: 'player-state', setup(build) {
        build.onResolve({ filter: /^@app\/hooks\/usePoll$|^\.\/(usePlayer|useDayData|Stage|Controls)$/ }, args => ({ path: args.path, namespace: 'state' }));
        build.onLoad({ filter: /.*/, namespace: 'state' }, () => ({ contents: `
            export const usePoll = (_load, deps) => {
                globalThis.playerPolls.push(deps);
                return { type: 'ready', data: { name: 'test', online: true, video: { width: 640, height: 360 } } };
            };
            export const useNow = () => Date.now();
            export const usePlayer = camera => ({ camera, engine: { seek() {} }, state: { type: 'live' } });
            export const playerTime = (_state, now) => now;
            export const useDayData = () => ({ spans: [], loaded: new Set() });
            export const Stage = ({ children }) => children;
            export const Clock = () => 'Clock';
            export const LiveButton = () => 'Live';
            export const PlayOptions = () => 'Options';
            export const Transport = () => 'Transport';
        ` }));
    } }],
});
const dir = await mkdtemp(`${tmpdir()}/player-layout-`);
let render;
try {
    await writeFile(`${dir}/render.mjs`, outputFiles[0].text);
    ({ render } = await import(`${dir}/render.mjs`));
} finally {
    await rm(dir, { recursive: true, force: true });
}

test('viewer retains video and controls without a camera selector or discovery poll', () => {
    globalThis.playerPolls = [];
    const html = render();
    assert.match(html, /class="player-stage"/);
    assert.match(html, /aria-label="Playback controls"/);
    assert.match(html, /aria-label="All cameras"/);
    assert.doesNotMatch(html, /<aside|has-cameras|aria-label="Cameras"/);
    assert.deepEqual(playerPolls, [['test']]);
});
