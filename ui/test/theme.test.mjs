import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('shared palette and all UI color literals stay grayscale', async () => {
    const files = ['src/styles/base.css', 'src/styles/shell.css', 'src/styles/cameras.css',
        'src/styles/player.css', 'public/icon.svg', 'index.html', 'vite.config.ts'];
    for (const file of files) {
        const source = await readFile(file, 'utf8');
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
