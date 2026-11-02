import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

// Exercise the data hook with a deterministic effect/clock harness, no DOM dependency.
const { outputFiles } = await build({
    entryPoints: ['src/components/player/useDayData.ts', 'src/components/player/zoom.ts'],
    outdir: 'unused', bundle: true, write: false, format: 'esm', tsconfig: 'tsconfig.app.json',
    plugins: [{ name: 'day-data-harness', setup(build) {
        build.onResolve({ filter: /^react$|^@app\/services\/recordings$|^@app\/hooks\/useVisibility$/ }, args => ({ path: args.path, namespace: 'harness' }));
        build.onLoad({ filter: /.*/, namespace: 'harness' }, args => ({ contents: args.path === 'react' ? `
            export const useRef = () => globalThis.h.cache;
            export const useState = () => [0, () => globalThis.h.updates++];
            export const useEffect = fn => { globalThis.h.effect = fn; };
            export const useMemo = fn => fn();
        ` : args.path.includes('recordings') ? 'export const getSpansForDay = (...args) => globalThis.h.fetch(...args);'
            : 'export const usePageVisible = () => globalThis.h.visible;' }));
    } }],
});
const [{ useDayData }, zoom] = await Promise.all(outputFiles.map(file => import(`data:text/javascript;base64,${Buffer.from(file.text).toString('base64')}`)));
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test('zoom presets and gesture bounds', () => {
    assert.deepEqual(zoom.ZOOM_PRESETS.map(p => [p.label, p.span]), [['24h', 86400000], ['1h', 3600000], ['10m', 600000]]);
    assert.equal(zoom.clampZoom(1), 120000);
    assert.equal(zoom.clampZoom(1e9), 86400000);
    assert.equal(zoom.clampZoom(600000), 600000);
});

test('day cache grows current spans, joins midnight, refreshes, isolates cameras and cancels', async () => {
    const realNow = Date.now;
    const today = new Date(2026, 5, 10).getTime();
    const yesterday = new Date(2026, 5, 9).getTime();
    let now = today + 3600000;
    Date.now = () => now;
    let timer;
    globalThis.window = { setTimeout(fn, ms) { timer = { fn, ms }; return 1; }, clearTimeout() { timer = null; } };
    const calls = [];
    const h = globalThis.h = { cache: { current: new Map() }, visible: true, updates: 0,
        fetch: async (camera, day) => {
            calls.push([camera, day]);
            return day === today ? [{ start: today, end: now - 2000 }] : [{ start: today - 10000, end: today }];
        } };
    const render = (camera = 'a', days = [yesterday, today]) => useDayData(camera, days, now);
    try {
        assert.equal(render().loaded.size, 0);
        let cleanup = h.effect();
        await flush();
        let data = render();
        assert.equal(data.loaded.size, 2);
        assert.equal(data.spans.length, 1);
        assert.equal(data.spans[0].start, today - 10000);
        assert.equal(data.spans[0].end, now - 1000);
        now += 5000;
        assert.equal(render().spans[0].end, now - 1000);
        assert.equal(calls.length, 2);
        assert.equal(timer.ms, 30000);
        now += 30000;
        await timer.fn();
        assert.deepEqual(calls, [['a', yesterday], ['a', today], ['a', today]]);
        cleanup();
        // Cached historical days don't refetch. Another camera must not see this cache.
        render('a', [yesterday]); cleanup = h.effect(); await flush();
        assert.equal(calls.length, 3); cleanup();
        assert.equal(render('b').loaded.size, 0);
        h.fetch = async () => [];
        cleanup = h.effect(); await flush();
        data = render('b'); assert.equal(data.loaded.size, 2); assert.equal(data.spans.length, 0); cleanup();
        // A late response after abort must never enter the cache.
        let resolve, signal;
        h.fetch = (_, __, s) => { signal = s; return new Promise(r => { resolve = r; }); };
        render('c', [today]); cleanup = h.effect(); cleanup();
        assert.equal(signal.aborted, true);
        resolve([{ start: today, end: now }]); await flush();
        assert.equal(render('c', [today]).loaded.size, 0);
        h.visible = false; render(); assert.equal(h.effect(), undefined);
    } finally { Date.now = realNow; delete globalThis.h; }
});
