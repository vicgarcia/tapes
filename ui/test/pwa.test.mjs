import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const { outputFiles } = await build({
    entryPoints: ['src/hooks/usePWA.ts'], bundle: true, write: false, format: 'esm',
    plugins: [{ name: 'pwa-harness', setup(build) {
        build.onResolve({ filter: /^react$|^virtual:pwa-register\/react$/ }, args => ({ path: args.path, namespace: 'harness' }));
        build.onLoad({ filter: /.*/, namespace: 'harness' }, args => ({ contents: args.path === 'react' ? `
            export const useState = initial => {
                const h = globalThis.harness, index = h.cursor++;
                if (!(index in h.states)) h.states[index] = typeof initial === 'function' ? initial() : initial;
                return [h.states[index], value => { h.states[index] = value; }];
            };
            export const createContext = value => ({ value, Provider: {} });
            export const createElement = (provider, props) => { provider.value = props.value; };
            export const useContext = context => context.Provider.value ?? context.value;
            export const useCallback = fn => fn;
            export const useEffect = fn => globalThis.harness.effects.push(fn);
        ` : `export const useRegisterSW = options => {
            globalThis.harness.registrationOptions = options;
            return { needRefresh: [globalThis.harness.refresh, value => globalThis.harness.refresh = value],
                updateServiceWorker: async reload => { globalThis.harness.reload = reload; } };
        };` }));
    } }],
});
const { InstallOfferProvider, useInstallOffer, useAppUpdate } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);

function setup({ ios = false, standalone = false, dismissed = false, storageBlocked = false } = {}) {
    const h = globalThis.harness = { cursor: 0, states: [], effects: [], refresh: false };
    const listeners = new Map();
    const timers = new Map();
    const storage = new Map(dismissed ? [['tapes.install-dismissed', '1']] : []);
    globalThis.window = {
        matchMedia: () => ({ matches: standalone }),
        addEventListener: (name, fn) => listeners.set(name, fn),
        removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
        setInterval: (fn, ms) => { timers.set(1, { fn, ms }); return 1; },
        clearInterval: id => timers.delete(id),
    };
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
        userAgent: ios ? 'iPhone' : 'Chrome', platform: '', maxTouchPoints: 0, onLine: true,
    } });
    window.navigator = navigator;
    globalThis.localStorage = {
        getItem: key => { if (storageBlocked) throw Error('blocked'); return storage.get(key); },
        setItem: (key, value) => { if (storageBlocked) throw Error('blocked'); storage.set(key, value); },
    };
    const render = hook => {
        h.cursor = 0; h.effects = [];
        if (hook === useInstallOffer) InstallOfferProvider({ children: null });
        return hook();
    };
    return { h, listeners, timers, storage, render };
}

test('Chromium install offer uses the browser prompt and persists dismissal', async () => {
    const { render, listeners, storage } = setup();
    assert.equal(render(useInstallOffer).type, 'none');
    const cleanup = harness.effects[0]();
    let prevented = false, prompted = false;
    listeners.get('beforeinstallprompt')({ preventDefault: () => prevented = true,
        prompt: async () => { prompted = true; }, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
    const offer = render(useInstallOffer);
    assert.equal(offer.type, 'prompt');
    assert.equal(prevented, true);
    await offer.install();
    assert.equal(prompted, true);
    assert.equal(storage.get('tapes.install-dismissed'), '1');
    assert.equal(render(useInstallOffer).type, 'none');
    cleanup();
    assert.equal(listeners.size, 0);
});

test('app-lifetime provider retains eligibility before home mounts and across camera navigation', async () => {
    const { render, listeners } = setup();
    // Start the provider on login without rendering a banner consumer.
    render(() => InstallOfferProvider({ children: 'login' }));
    const cleanup = harness.effects[0]();
    let prompted = 0;
    listeners.get('beforeinstallprompt')({ preventDefault() {},
        prompt: async () => { prompted++; }, userChoice: Promise.resolve({ outcome: 'accepted' }) });
    render(() => InstallOfferProvider({ children: 'home' }));
    assert.equal(useInstallOffer().type, 'prompt');
    // Removing the home/banner must not discard the deferred browser event.
    render(() => InstallOfferProvider({ children: 'camera' }));
    render(() => InstallOfferProvider({ children: 'home' }));
    await useInstallOffer().install();
    assert.equal(prompted, 1);
    render(() => InstallOfferProvider({ children: 'home' }));
    assert.equal(useInstallOffer().type, 'none');
    cleanup();
    assert.equal(listeners.size, 0);
});

test('iOS instructions, standalone, prior dismissal and blocked storage', () => {
    for (const options of [{ standalone: true }, { dismissed: true }]) {
        const { render } = setup({ ios: true, ...options });
        assert.equal(render(useInstallOffer).type, 'none');
    }
    const { render } = setup({ ios: true, storageBlocked: true });
    const offer = render(useInstallOffer);
    assert.equal(offer.type, 'ios');
    offer.dismiss();
    assert.equal(render(useInstallOffer).type, 'none');
});

test('appinstalled clears the offer', () => {
    const { render, listeners } = setup({ ios: true });
    render(useInstallOffer);
    harness.effects[0]();
    listeners.get('appinstalled')();
    assert.equal(render(useInstallOffer).type, 'none');
});

test('updates check hourly while online, clean up, and reload only on request', async () => {
    const { h, render, timers } = setup();
    render(useAppUpdate);
    let checks = 0;
    h.registrationOptions.onRegisteredSW('/sw.js', { update: async () => { checks++; } });
    h.refresh = true;
    let offer = render(useAppUpdate);
    const cleanup = h.effects[0]();
    assert.equal(timers.get(1).ms, 3600000);
    await timers.get(1).fn();
    assert.equal(checks, 1);
    navigator.onLine = false;
    await timers.get(1).fn();
    assert.equal(checks, 1);
    assert.equal(h.reload, undefined);
    offer.dismiss();
    offer = render(useAppUpdate);
    assert.equal(offer.needRefresh, false);
    await offer.update();
    assert.equal(h.reload, true);
    cleanup();
    assert.equal(timers.size, 0);
});

test('production manifest and worker contain only the shell and deny API navigations', async () => {
    const manifest = JSON.parse(await readFile('dist/manifest.webmanifest', 'utf8'));
    assert.equal(manifest.name, 'Tapes');
    assert.equal(manifest.theme_color, '#0b0d10');
    assert.equal(manifest.background_color, '#0b0d10');
    assert.equal(manifest.display, 'standalone');
    for (const icon of manifest.icons) assert.ok((await readFile(`dist/${icon.src}`)).length > 0);
    const sw = await readFile('dist/sw.js', 'utf8');
    assert.match(sw, /precacheAndRoute/);
    assert.doesNotMatch(sw, /NetworkFirst|CacheFirst|StaleWhileRevalidate/);
    assert.match(sw, /"SKIP_WAITING"===\w+\.data\.type&&self\.skipWaiting\(\)/);
    const pattern = sw.match(/denylist:\[(\/.*?\/)\]/)[1];
    const deny = new RegExp(pattern.slice(1, -1));
    for (const route of ['/health', '/auth', '/login', '/logout', '/cameras', '/cameras/test/snapshot', '/cameras/test/live/index.m3u8', '/cameras/test/playback?start=now']) {
        assert.equal(deny.test(route), true, route);
    }
    assert.equal(deny.test('/events'), false);
    assert.equal(deny.test('/'), false);
    const urls = [...sw.matchAll(/url:"([^"]+)"/g)].map(match => match[1]);
    assert.ok(urls.includes('index.html'));
    assert.ok(urls.every(url => !url.startsWith('cameras') && !/\.(mp4|m3u8|ts|jpg)$/.test(url)));
});
