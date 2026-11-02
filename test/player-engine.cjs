// Run against the synthetic test stack: TAPES_UI_URL=http://127.0.0.1:18673 node test/player-engine.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
    assert.ok(process.env.TAPES_UI_URL, 'Set TAPES_UI_URL to the synthetic test stack');
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        const base = process.env.TAPES_UI_URL;
        assert.equal((await page.request.post(`${base}/login`, { form: { username: 'test', password: 'test' } })).status(), 200);
        const live = page.waitForResponse(response => response.url().includes('/cameras/test/live/index.m3u8'));
        await page.goto(`${base}/#/cameras/test`);
        assert.equal((await live).status(), 200);
        await page.locator('[data-mode="live"]').waitFor();
        assert.equal(await page.locator('video').count(), 3);
        assert.equal(await page.locator('video.is-visible').count(), 1);
        const stage = page.locator('.plain-player-stage');
        const size = await stage.boundingBox();
        assert.ok(size.width > 0 && size.height > 0);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForFunction(() => document.querySelector('.plain-player-stage').clientWidth === 390);
        const resized = await stage.boundingBox();
        assert.ok(Math.abs(resized.height - 390 * 9 / 16) < 1);

        // Allow completed segments to accumulate, then open a time safely behind live.
        await page.waitForTimeout(22000);
        const response = await page.request.get(`${base}/cameras/test/recordings?start=${encodeURIComponent(new Date(Date.now() - 120000).toISOString())}&end=${encodeURIComponent(new Date().toISOString())}`);
        assert.equal(response.status(), 200);
        const { spans } = await response.json();
        assert.ok(spans.length);
        const time = Math.max(Date.parse(spans[0].start) + 1000, Date.now() - 18000);
        for (const t of [String(time), new Date(time).toISOString()]) {
            const playback = page.waitForResponse(response => response.url().includes('/cameras/test/playback?'));
            await page.goto(`${base}/#/cameras/test?t=${encodeURIComponent(t)}`);
            assert.equal((await playback).status(), 206);
            await page.locator('[data-mode="playback"]').waitFor();
            const clip = new URL((await playback).url());
            const clipStart = Date.parse(clip.searchParams.get('start'));
            assert.ok(clipStart >= time - 10000 && clipStart <= time + 10, 'pre-roll is bounded by the recorded span start');
            await page.getByRole('link', { name: 'Back to cameras' }).click();
            await page.locator('.camera-tile').first().waitFor();
        }
        assert.deepEqual(errors, []);
        console.log('PASS: live proxied playlist, epoch/RFC3339 playback 206, slots, ResizeObserver sizing, back link, no console errors');
        console.log('Decoded playback was not verified: bundled Chromium has no H.264 decoder.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
