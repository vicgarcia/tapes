import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

// Bundle the TypeScript services with the same path aliases as the app.
const { outputFiles } = await build({
    entryPoints: ['src/services/cameras.ts', 'src/services/base.ts'],
    bundle: true, write: false, outdir: 'unused', format: 'esm',
    tsconfig: 'tsconfig.app.json',
});
const modules = await Promise.all(outputFiles.map(file => import(`data:text/javascript;base64,${Buffer.from(file.text).toString('base64')}`)));
const [cameras, base] = modules;
globalThis.window = new EventTarget();
globalThis.CustomEvent ??= class extends Event { };

test('query omits empty values and encodes names', () => {
    assert.equal(base.withQuery('/cameras', { name: 'front door', start: 0, end: null, empty: '' }), '/cameras?name=front+door&start=0');
    assert.equal(cameras.getLiveUrl('front/door'), '/cameras/front%2Fdoor/live/index.m3u8');
});

test('requests use session cookies and bypass caches', async () => {
    globalThis.fetch = async (url, init) => {
        assert.equal(url, '/auth');
        assert.equal(init.credentials, 'same-origin');
        assert.equal(init.cache, 'no-store');
        return new Response(null, { status: 204 });
    };
    await base.request('/auth');
});

test('401 ends the session; network failure signals offline; abort is silent', async () => {
    const seen = [];
    window.addEventListener('unauthorized', () => seen.push('unauthorized'));
    window.addEventListener('server-unreachable', () => seen.push('offline'));
    globalThis.fetch = async () => new Response(null, { status: 401 });
    await assert.rejects(base.request('/auth'), error => error instanceof base.ApiError && error.status === 401);
    globalThis.fetch = async () => { throw new TypeError('network down'); };
    await assert.rejects(base.request('/cameras'));
    globalThis.fetch = async () => { throw new DOMException('cancelled', 'AbortError'); };
    await assert.rejects(base.request('/cameras'), base.isAbort);
    assert.deepEqual(seen, ['unauthorized', 'offline']);
});

test('camera contract excludes snapshot capability and handles absent snapshots', async () => {
    globalThis.fetch = async () => Response.json([{ name: 'test', online: true, video: null }]);
    assert.deepEqual(await cameras.getCameras(), [{ type: 'camera', name: 'test', online: true, video: null }]);
    globalThis.fetch = async () => new Response(null, { status: 404 });
    assert.equal(await cameras.getSnapshot({ name: 'test' }), null);
});

test('snapshot converts RFC3339 time and creates a caller-owned object URL', async () => {
    globalThis.fetch = async () => new Response(new Blob(['jpeg']), { headers: { 'X-Snapshot-Time': '2026-10-24T16:55:49.673Z' } });
    const snapshot = await cameras.getSnapshot({ name: 'test' });
    assert.equal(snapshot.time, Date.parse('2026-10-24T16:55:49.673Z'));
    assert.equal(snapshot.camera, 'test');
    assert.equal('source' in snapshot, false);
    assert.match(snapshot.url, /^blob:/);
    URL.revokeObjectURL(snapshot.url);
});
