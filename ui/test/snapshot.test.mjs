import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

// A small effect harness keeps polling and cancellation tests independent of wall time.
const { outputFiles } = await build({
    entryPoints: ['src/hooks/useSnapshot.ts'], bundle: true, write: false, format: 'esm',
    tsconfig: 'tsconfig.app.json',
    plugins: [{ name: 'hook-harness', setup(build) {
        build.onResolve({ filter: /^react$|^@app\/services\/cameras$/ }, args => ({ path: args.path, namespace: 'harness' }));
        build.onLoad({ filter: /.*/, namespace: 'harness' }, args => ({ contents: args.path === 'react' ? `
            export const useState = initial => [initial, value => globalThis.harness.state = value];
            export const useRef = () => globalThis.harness.ref;
            export const useEffect = (fn, deps) => globalThis.harness.effects.push({fn, deps});
        ` : 'export const getSnapshot = (...args) => globalThis.harness.getSnapshot(...args);' }));
    } }],
});
const { useSnapshot } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

test('snapshots refresh, pause, decode before replacement, and release URLs', async () => {
    const originalRevoke = URL.revokeObjectURL;
    const revoked = [];
    const timers = new Map();
    let nextId = 0;
    globalThis.window = {
        setTimeout(fn, ms) { const id = ++nextId; timers.set(id, { fn, ms }); return id; },
        clearTimeout(id) { timers.delete(id); },
    };
    let decode = async () => {};
    globalThis.Image = class { decode() { return decode(); } };
    URL.revokeObjectURL = url => revoked.push(url);
    const h = globalThis.harness = { state: null, ref: { current: null }, effects: [], getSnapshot: null };
    let calls = 0;
    let response = { url: 'blob:first', time: 123 };
    h.getSnapshot = async () => { calls++; return response; };
    const mount = active => {
        h.effects = [];
        useSnapshot({ name: 'test' }, active);
        const cleanups = h.effects.map(effect => effect.fn());
        return () => cleanups.forEach(cleanup => cleanup?.());
    };
    const tick = async () => {
        const [id, timer] = [...timers].find(([, timer]) => timer.ms === 5000);
        timers.delete(id); timer.fn(); await flush();
    };
    try {
        let cleanup = mount(false);
        await flush(); assert.equal(calls, 0); cleanup();
        cleanup = mount(true);
        await flush(); assert.equal(h.state.snapshot.url, 'blob:first');
        response = { url: 'blob:second', time: 456 };
        let decoded;
        decode = () => new Promise(resolve => { decoded = resolve; });
        await tick(); assert.equal(h.state.snapshot.url, 'blob:first');
        decoded(); await flush(); assert.equal(h.state.snapshot.url, 'blob:second');
        assert.ok([...timers.values()].some(timer => timer.ms === 1000));
        for (const [id, timer] of timers) if (timer.ms === 1000) { timers.delete(id); timer.fn(); }
        assert.ok(revoked.includes('blob:first'));
        h.getSnapshot = async () => { throw new Error('temporary failure'); };
        await tick(); assert.equal(h.state.snapshot.url, 'blob:second');
        h.getSnapshot = async () => null;
        await tick(); assert.equal(h.state.type, 'none'); assert.ok(revoked.includes('blob:second'));
        cleanup(); assert.equal(timers.size, 0);

        let resolve;
        let signal;
        h.getSnapshot = (_, s) => { signal = s; return new Promise(r => { resolve = r; }); };
        cleanup = mount(true); cleanup(); assert.equal(signal.aborted, true);
        resolve({ url: 'blob:cancelled', time: 789 }); await flush();
        assert.ok(revoked.includes('blob:cancelled')); assert.equal(timers.size, 0);

        decode = async () => { throw new Error('invalid JPEG'); };
        h.getSnapshot = async () => ({ url: 'blob:bad' });
        cleanup = mount(true); await flush();
        assert.equal(h.state.type, 'none'); assert.ok(revoked.includes('blob:bad')); cleanup();
    } finally {
        URL.revokeObjectURL = originalRevoke;
        delete globalThis.harness;
    }
});
