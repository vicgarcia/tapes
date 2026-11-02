import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('shared palette stays grayscale except semantic status tokens', async () => {
    const files = ['src/styles/base.css', 'src/styles/shell.css', 'src/styles/cameras.css',
        'src/styles/player.css', 'public/icon.svg', 'index.html', 'vite.config.ts'];
    for (const file of files) {
        let source = await readFile(file, 'utf8');
        if (file === 'src/styles/base.css') source = source.replace(/^\s*--(?:live|live-bg|ok|ok-bg|warn|warn-bg):.*$/gm, '');
        for (const [, hex] of source.matchAll(/#([\da-f]{6}|[\da-f]{3})\b/gi)) {
            const rgb = hex.length === 3 ? [...hex] : hex.match(/../g);
            assert.equal(rgb[0], rgb[1], `${file}: #${hex}`);
            assert.equal(rgb[1], rgb[2], `${file}: #${hex}`);
        }
        for (const [, r, g, b] of source.matchAll(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/g)) {
            assert.equal(r, g, `${file}: rgb(${r}, ${g}, ${b})`);
            assert.equal(g, b, `${file}: rgb(${r}, ${g}, ${b})`);
        }
    }
    const base = await readFile('src/styles/base.css', 'utf8');
    assert.match(base, /--bg: #0a0a0a;/);
    assert.match(base, /--accent: #c4c4c4;/);
    const shell = await readFile('src/styles/shell.css', 'utf8');
    assert.doesNotMatch(shell, /--(?:bg|accent|surface|text):/);
});

test('live, online and offline indicators use red, green and yellow tokens', async () => {
    const base = await readFile('src/styles/base.css', 'utf8');
    assert.match(base, /--live: #ff4d4f;/);
    assert.match(base, /--ok: #3ecf8e;/);
    assert.match(base, /--warn: #f5cf61;/);
    assert.match(base, /\.badge-live \{[^}]*background: var\(--live\)/);
    const cameras = await readFile('src/styles/cameras.css', 'utf8');
    assert.match(cameras, /\.status-pill\.is-online \{ color: var\(--ok\); background: var\(--ok-bg\); \}/);
    assert.match(cameras, /\.status-pill\.is-offline \{ color: var\(--warn\); background: var\(--warn-bg\); \}/);
    const player = await readFile('src/styles/player.css', 'utf8');
    assert.match(player, /\.btn-live\.is-live \{[^}]*color: var\(--live\)/);
});
