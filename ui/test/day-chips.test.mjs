import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const { outputFiles } = await build({
    entryPoints: ['src/components/common/DayChips.tsx'], bundle: true, write: false,
    format: 'esm', tsconfig: 'tsconfig.app.json',
    plugins: [{ name: 'day-chips-harness', setup(build) {
        build.onResolve({ filter: /^react(?:\/jsx-runtime)?$/ }, args => ({ path: args.path, namespace: 'harness' }));
        build.onLoad({ filter: /.*/, namespace: 'harness' }, args => ({ contents: args.path.endsWith('jsx-runtime') ? `
            export const jsx = (type, props) => ({ type, props });
            export const jsxs = jsx;
        ` : `
            export const useState = initial => [globalThis.h.count ?? initial, update => {
                globalThis.h.count = update(globalThis.h.count ?? initial);
            }];
            export const useRef = () => ({ current: {} });
            export const useMemo = fn => fn();
            export const useLayoutEffect = () => {};
            export const useEffect = (fn, deps) => { globalThis.h.effect = fn; globalThis.h.deps = deps; };
        ` }));
    } }],
});
const { DayChips } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);

test('infinite tiles extend the rendered total for old deep links and subsequent older navigation', () => {
    const h = globalThis.h = {};
    const originalObserver = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = class {
        constructor(callback) { h.intersect = () => callback([{ isIntersecting: true }]); }
        observe() {}
        disconnect() { h.disconnected = true; }
    };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const selected = new Date(today); selected.setDate(selected.getDate() - 100);
    const render = day => DayChips({ selected: +day, onSelect() {} });
    try {
        let tiles = render(selected).props.children[0];
        const firstTotal = tiles.length;
        assert.ok(firstTotal >= 120);
        let cleanup = h.effect();
        h.intersect(); cleanup();
        tiles = render(selected).props.children[0];
        assert.equal(tiles.length, firstTotal + 21);
        assert.deepEqual(h.deps, [tiles.length]);
        cleanup = h.effect(); h.intersect(); cleanup();
        assert.equal(render(selected).props.children[0].length, firstTotal + 42);
        selected.setDate(selected.getDate() - 200);
        const olderTotal = render(selected).props.children[0].length;
        cleanup = h.effect(); h.intersect(); cleanup();
        assert.equal(render(selected).props.children[0].length, olderTotal + 21);
        assert.equal(h.disconnected, true);
    } finally { globalThis.IntersectionObserver = originalObserver; delete globalThis.h; }
});
