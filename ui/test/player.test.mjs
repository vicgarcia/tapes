import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const { outputFiles } = await build({
    entryPoints: ['src/components/player/engine.ts', 'src/components/player/startTime.ts', 'src/services/recordings.ts'],
    bundle: true, write: false, outdir: 'unused', format: 'esm', tsconfig: 'tsconfig.app.json',
    plugins: [{ name: 'fake-hls', setup(build) {
        build.onResolve({ filter: /^hls.js\/light$/ }, () => ({ path: 'hls', namespace: 'fake' }));
        build.onLoad({ filter: /.*/, namespace: 'fake' }, () => ({ contents: `
            export default class Hls {
                static isSupported() { return globalThis.hlsSupport ?? false; }
                static Events = { ERROR: 'error' };
                constructor(config) { this.config = config; globalThis.lastHls = this; }
                on() {}
                loadSource(url) { this.url = url; }
                attachMedia(video) { this.video = video; }
                destroy() { this.destroyed = true; }
            }
        ` }));
    } }],
});
const [ { PlayerEngine }, { startTime }, recordings ] = await Promise.all(outputFiles.map(file => import(`data:text/javascript;base64,${Buffer.from(file.text).toString('base64')}`)));
let clock = 1000;
globalThis.performance = { now: () => clock };
globalThis.window = Object.assign(new EventTarget(), { setTimeout: () => 1, clearTimeout() {} });
globalThis.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
globalThis.HTMLMediaElement = { HAVE_CURRENT_DATA: 2 };

class Video extends EventTarget {
    currentTime = 0; duration = 70; paused = true; seeking = false; ended = false; readyState = 4;
    ahead = 0; src = ''; playbackRate = 1;
    classes = new Set();
    classList = { toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name) };
    get buffered() { return { length: 1, start: () => 0, end: () => this.currentTime + this.ahead }; }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
    load() {}
    removeAttribute() { this.src = ''; }
    getAttribute() { return this.src; }
    canPlayType() { return 'maybe'; }
    fire(event) { this.dispatchEvent(new Event(event)); }
}
const target = Date.now() - 600000;
function setup() {
    const engine = new PlayerEngine('front/door', null);
    const videos = [new Video(), new Video(), new Video()];
    engine.attach(...videos);
    return { engine, videos };
}
function spans(start = target - 20000, end = Date.now()) {
    globalThis.fetch = async () => new Response(JSON.stringify({ spans: [{ start: new Date(start).toISOString(), end: new Date(end).toISOString() }] }));
}
function ready(video, ahead = 3) {
    video.fire('loadedmetadata');
    video.ahead = ahead;
    video.fire('canplay');
}

test('deep-link times accept epoch milliseconds and RFC3339, invalid times use live', () => {
    assert.equal(startTime('0'), 0);
    assert.equal(startTime('2026-10-24T16:55:49.673Z'), 1792860949673);
    for (const value of [null, '', ' ', 'garbage', '999999999999999999999999']) assert.equal(startTime(value), null);
});

test('recordings convert times only at the API boundary and clamp clips', async () => {
    const clip = recordings.makeClip('front/door', target + 0.4, 900);
    assert.equal(clip.start, Math.round(target + 0.4));
    const url = new URL(recordings.getClipUrl(clip), 'http://test');
    assert.equal(url.pathname, '/cameras/front%2Fdoor/playback');
    assert.equal(url.searchParams.get('start'), new Date(clip.start).toISOString());
    assert.equal(url.searchParams.get('duration'), '600');
    assert.equal(recordings.makeClip('x', target, -1).duration, 1);
    globalThis.fetch = async url => {
        assert.match(url, /\/cameras\/front%2Fdoor\/recordings\?start=/);
        return new Response(JSON.stringify({ spans: [{ start: new Date(target).toISOString(), end: new Date(target + 1000).toISOString() }] }));
    };
    assert.deepEqual(await recordings.getSpans('front/door', target, target + 1000), [{ type: 'span', camera: 'front/door', start: target, end: target + 1000 }]);
});

test('seek windows retain the picture, gate activation and rebuffering on 3 seconds, and preload 20 wall seconds early', async () => {
    spans();
    const { engine, videos: [live, a, b] } = setup();
    try {
        await engine.seek(target);
        const first = new URL(b.src, 'http://test');
        assert.equal(Date.parse(first.searchParams.get('start')), target - 10000);
        assert.equal(first.searchParams.get('duration'), '70');
        ready(b, 2.9);
        assert.equal(engine.getState().status, 'loading');
        assert.equal(b.paused, true);
        b.ahead = 3; b.fire('progress');
        assert.equal(engine.getState().status, 'ready');
        assert.equal(b.paused, false);
        assert.ok(b.classes.has('is-visible'));
        assert.ok(!live.classes.has('is-visible'));
        clock += 1000; engine.sample();
        b.ahead = 0; clock += 601; engine.sample();
        assert.equal(engine.getState().status, 'buffering');
        assert.equal(b.paused, true);
        b.ahead = 2.9; engine.sample();
        assert.equal(engine.getState().status, 'buffering');
        b.ahead = 3; engine.sample();
        assert.equal(engine.getState().status, 'ready');
        engine.setRate(2);
        b.currentTime = 29; engine.sample();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(a.src, '');
        b.currentTime = 30; engine.sample();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(new URL(a.src, 'http://test').searchParams.get('duration'), '60');
        ready(a, 6);
        b.currentTime = 70; b.fire('ended');
        assert.ok(a.classes.has('is-visible'));
        assert.ok(!b.classes.has('is-visible'));
        await engine.seek(target - 100000);
        assert.ok(a.classes.has('is-visible'), 'old picture stays up while seeking outside window');
    } finally { engine.detach(); }
});

test('live uses low-latency HLS and releases it on visibility changes and detach', () => {
    globalThis.hlsSupport = true;
    const { engine } = setup();
    try {
        const hls = globalThis.lastHls;
        assert.equal(hls.config.lowLatencyMode, true);
        assert.equal(hls.config.maxLiveSyncPlaybackRate, 1.5);
        assert.equal(hls.url, '/cameras/front%2Fdoor/live/index.m3u8');
        document.visibilityState = 'hidden';
        document.dispatchEvent(new Event('visibilitychange'));
        assert.equal(hls.destroyed, true);
        document.visibilityState = 'visible';
        document.dispatchEvent(new Event('visibilitychange'));
        assert.notEqual(globalThis.lastHls, hls);
        engine.detach();
        assert.equal(globalThis.lastHls.destroyed, true);
    } finally {
        globalThis.hlsSupport = false;
        document.visibilityState = 'visible';
        engine.detach();
    }
});

test('live ignores readyState dips and seeks; only a 600ms frozen picture stalls', () => {
    const { engine, videos: [live] } = setup();
    try {
        live.fire('playing');
        live.readyState = 1; live.seeking = true;
        clock += 1000; engine.sample();
        clock += 599; engine.sample();
        assert.equal(engine.getState().status, 'playing');
        clock += 2; engine.sample();
        assert.equal(engine.getState().status, 'stalled');
        live.currentTime += 0.1; engine.sample();
        assert.equal(engine.getState().status, 'playing');
    } finally { engine.detach(); }
});

test('playhead emits at 80ms intervals, with jumps immediate; detach invalidates pending seeks', async () => {
    spans();
    const { engine } = setup();
    try {
        let emits = 0;
        const unsubscribe = engine.subscribe(() => emits++);
        engine.emitTime(target, null);
        for (let i = 1; i <= 7; i++) { clock += 10; engine.emitTime(target + i * 10, engine.getState().time); }
        assert.equal(emits, 1);
        clock += 10; engine.emitTime(target + 80, engine.getState().time);
        assert.equal(emits, 2);
        engine.emitTime(target + 5000, engine.getState().time);
        assert.equal(emits, 3);
        unsubscribe();
        let resolve;
        globalThis.fetch = () => new Promise(r => { resolve = r; });
        const pending = engine.seek(target);
        engine.detach();
        resolve(new Response(JSON.stringify({ spans: [{ start: new Date(target).toISOString(), end: new Date(target + 10000).toISOString() }] })));
        await pending;
        assert.ok(engine.slots.every(slot => slot.clip === null));
    } finally { engine.detach(); }
});

const flush = () => new Promise(resolve => setImmediate(resolve));
function unavailable() {
    globalThis.fetch = async () => new Response('{"error":"recordings unavailable"}', { status: 502 });
}
function empty() {
    globalThis.fetch = async () => new Response('{"spans":[]}');
}

test('failed availability seek keeps its target for retry; only successful empty spans mean end', async () => {
    const { engine, videos: [, , b] } = setup();
    try {
        unavailable();
        await engine.seek(target);
        assert.equal(engine.getState().status, 'error');
        assert.equal(engine.getState().time, target);
        assert.equal(engine.getState().notice, null);
        assert.equal(b.src, '');
        spans();
        await engine.seek(engine.getState().time, true);
        ready(b);
        assert.equal(engine.getState().status, 'ready');
        assert.equal(engine.getState().time, target);
        assert.equal(b.paused, false);
        empty();
        await engine.seek(target - 100000);
        assert.equal(engine.getState().status, 'end');
        assert.match(engine.getState().notice.text, /No recordings after/);
    } finally { engine.detach(); }
});

test('preload failure leaves playback healthy, continuation failure offers retry at the window end', async () => {
    spans();
    const { engine, videos: [, a, b] } = setup();
    try {
        await engine.seek(target);
        ready(b);
        unavailable();
        b.currentTime = 50;
        engine.sample();
        await flush();
        assert.equal(engine.getState().status, 'ready');
        assert.equal(b.paused, false);
        assert.equal(a.src, '');
        b.currentTime = b.duration;
        b.fire('ended');
        await flush();
        const endedAt = target + 60000;
        assert.equal(engine.getState().status, 'error');
        assert.equal(engine.getState().time, endedAt);
        assert.equal(engine.getState().notice, null);
        spans();
        await engine.seek(engine.getState().time, true);
        ready(a);
        assert.equal(engine.getState().status, 'ready');
        assert.equal(engine.getState().time, endedAt);
        empty();
        a.currentTime = a.duration;
        a.fire('ended');
        await flush();
        assert.equal(engine.getState().status, 'end');
        assert.equal(engine.getState().notice.text, 'End of recordings');
    } finally { engine.detach(); }
});

for (const result of ['failure', 'empty']) {
    test(`clip-error availability ${result} is handled without escaping the event handler`, async () => {
        spans();
        const { engine, videos: [, , b] } = setup();
        try {
            await engine.seek(target);
            if (result === 'failure') unavailable(); else empty();
            b.fire('error');
            await flush();
            assert.equal(engine.getState().status, result === 'failure' ? 'error' : 'end');
            assert.equal(engine.getState().time, target);
            assert.equal(engine.getState().notice, null);
            if (result === 'failure') {
                spans();
                await engine.seek(engine.getState().time, true);
                ready(b);
                assert.equal(engine.getState().status, 'ready');
                assert.equal(engine.getState().time, target);
            }
        } finally { engine.detach(); }
    });
}

for (const outcome of ['cancelled', 'failure', 'playable', 'empty']) {
    for (const path of ['seek', 'clip-error', 'preload', 'ended']) {
        for (const change of ['seek', 'live', 'detach']) {
            test(`stale ${path} ${outcome} cannot override ${change}`, async () => {
                spans();
                const { engine, videos: [, , b] } = setup();
                try {
                    if (path !== 'seek') { await engine.seek(target); ready(b); }
                    let settle;
                    globalThis.fetch = () => new Promise((resolve, reject) => {
                        settle = () => outcome === 'cancelled'
                            ? reject(new DOMException('cancelled', 'AbortError'))
                            : outcome === 'failure'
                                ? resolve(new Response('{}', { status: 502 }))
                                : resolve(new Response(JSON.stringify({ spans: outcome === 'empty' ? [] : [{
                                start: new Date(target - 100000).toISOString(), end: new Date(target + 600000).toISOString(),
                            }] })));
                    });
                    let pending;
                    if (path === 'seek') pending = engine.seek(target - 100000);
                    if (path === 'clip-error') b.fire('error');
                    if (path === 'preload') pending = engine.preloadNext();
                    if (path === 'ended') pending = engine.onEnded();
                    assert.ok(settle);
                    if (change === 'seek') { spans(); await engine.seek(target - 200000); }
                    if (change === 'live') engine.goLive();
                    if (change === 'detach') engine.detach();
                    const state = engine.getState();
                    settle();
                    await pending;
                    await flush();
                    assert.deepEqual(engine.getState(), state);
                } finally { engine.detach(); }
            });
        }
    }
}

test('availability authentication failures still dispatch unauthorized', async () => {
    globalThis.CustomEvent ??= class CustomEvent extends Event {};
    const { engine } = setup();
    let unauthorized = 0;
    const onUnauthorized = () => unauthorized++;
    window.addEventListener('unauthorized', onUnauthorized);
    try {
        globalThis.fetch = async () => new Response('{}', { status: 401 });
        await engine.seek(target);
        assert.equal(unauthorized, 1);
        assert.equal(engine.getState().status, 'error');
        assert.equal(engine.getState().notice, null);
    } finally {
        window.removeEventListener('unauthorized', onUnauthorized);
        engine.detach();
    }
});
