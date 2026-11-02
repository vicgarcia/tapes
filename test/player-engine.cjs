// Run against the synthetic test stack: TAPES_UI_URL=http://127.0.0.1:18673 node test/player-engine.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

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
        const stage = page.locator('.stage');
        const size = await stage.boundingBox();
        assert.ok(size.width > 0 && size.height > 0);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForFunction(() => document.querySelector('.stage').clientWidth === 390);
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
            await page.getByRole('link', { name: 'All cameras' }).click();
            await page.locator('.camera-tile').first().waitFor();
        }
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`${base}/#/cameras/test`);
        await page.locator('.stage[data-mode="live"]').waitFor();
        assert.equal(await page.getByRole('button', { name: 'Forward 10 seconds', exact: true }).isDisabled(), true);
        assert.equal(await page.getByRole('button', { name: '8×', exact: true }).count(), 0);
        for (const rate of [2, 4, 1]) {
            await page.getByRole('button', { name: `${rate}×`, exact: true }).click();
            assert.equal(await page.getByRole('button', { name: `${rate}×`, exact: true }).getAttribute('aria-pressed'), 'true');
        }
        await page.locator('.player-title').click();
        for (const [key, rate] of [['2', 2], [']', 4], ['[', 2], ['1', 1], ['4', 4]]) {
            await page.keyboard.press(key);
            assert.equal(await page.getByRole('button', { name: `${rate}×`, exact: true }).getAttribute('aria-pressed'), 'true');
        }
        await page.getByRole('button', { name: 'Keyboard shortcuts', exact: true }).click();
        await page.getByRole('dialog').waitFor();
        await page.keyboard.press('Tab');
        assert.equal(await page.getByRole('button', { name: 'Close', exact: true }).evaluate(el => el === document.activeElement), true);
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        await page.keyboard.press('?');
        await page.getByRole('dialog').waitFor();
        await page.keyboard.press('?');
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        await page.getByRole('button', { name: 'Back 10 seconds', exact: true }).click();
        await page.locator('.stage[data-mode="playback"]').waitFor();
        assert.equal(await page.getByRole('button', { name: 'Forward 10 seconds', exact: true }).isEnabled(), true);
        await page.getByRole('button', { name: 'Pause', exact: true }).click();
        await page.getByRole('button', { name: 'Play', exact: true }).waitFor();
        await page.keyboard.press('k');
        await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
        await page.keyboard.press('Space');
        await page.getByRole('button', { name: 'Play', exact: true }).waitFor();
        await page.keyboard.press('l');
        await page.locator('.stage[data-mode="live"]').waitFor();
        await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
        await page.waitForFunction(() => !!document.fullscreenElement);
        const fullscreen = await page.locator('.stage').boundingBox();
        assert.equal(fullscreen.width, 1440);
        assert.equal(fullscreen.height, 900);
        await page.evaluate(() => document.exitFullscreen());
        // No-recording times leave the video surface empty, not covered by a card.
        await page.goto(`${base}/#/cameras/test?t=2000-01-01T00:00:00Z`);
        await page.locator('.stage[data-status="end"]').waitFor();
        assert.equal(await page.locator('.stage-card').count(), 0);
        assert.equal(await page.locator('.clock-status').textContent(), 'No recording');
        await page.getByRole('button', { name: 'Pause', exact: true }).click();
        const pausedTime = Date.parse(await page.locator('.clock-time').getAttribute('datetime'));
        await page.locator('.player-title').click();
        await page.keyboard.press('ArrowLeft');
        await page.waitForFunction(t => Date.parse(document.querySelector('.clock-time').dateTime) === t - 10000, pausedTime);
        await page.keyboard.press('Shift+ArrowLeft');
        await page.waitForFunction(t => Date.parse(document.querySelector('.clock-time').dateTime) === t - 70000, pausedTime);
        await page.keyboard.press('ArrowRight');
        await page.waitForFunction(t => Date.parse(document.querySelector('.clock-time').dateTime) === t - 60000, pausedTime);
        await page.keyboard.press('Shift+ArrowRight');
        await page.waitForFunction(t => Date.parse(document.querySelector('.clock-time').dateTime) === t, pausedTime);
        for (const [label, offset] of [['Back 1 minute', -60000], ['Forward 10 seconds', -50000], ['Forward 1 minute', 10000]]) {
            await page.getByRole('button', { name: label, exact: true }).click();
            await page.waitForFunction(t => Date.parse(document.querySelector('.clock-time').dateTime) === t, pausedTime + offset);
        }
        const oldStage = await page.locator('.stage').boundingBox();
        const center = { x: oldStage.x + oldStage.width / 2, y: oldStage.y + oldStage.height / 2 };
        await page.mouse.click(center.x, center.y);
        await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
        await page.mouse.click(center.x, center.y);
        await page.getByRole('button', { name: 'Play', exact: true }).waitFor();
        await page.mouse.dblclick(oldStage.x + oldStage.width * 0.15, center.y, { delay: 60 });
        await page.waitForFunction(t => Date.parse(document.querySelector('.clock-time').dateTime) === t, pausedTime);
        await page.mouse.dblclick(oldStage.x + oldStage.width * 0.85, center.y, { delay: 60 });
        await page.waitForFunction(t => Date.parse(document.querySelector('.clock-time').dateTime) === t + 10000, pausedTime);
        await page.getByRole('button', { name: 'Jump to live', exact: true }).first().click();
        await page.locator('.stage[data-mode="live"]').waitFor();



        await page.goto(`${base}/#/cameras/test`);
        await page.locator('.stage[data-mode="live"]').waitFor();
        for (const [name, width, height] of [['desktop', 1440, 900], ['phone-portrait', 390, 844], ['phone-landscape', 844, 390]]) {
            await page.setViewportSize({ width, height });
            await page.waitForTimeout(350);
            const box = await page.locator('.stage').boundingBox();
            assert.ok(box.width > 0 && box.height > 0 && box.x >= 0 && box.y >= 0);
            assert.ok(box.x + box.width <= width + 1 && box.y + box.height <= height + 1);
            const landscape = name === 'phone-landscape';
            assert.equal(await page.locator('.player-header').isVisible(), !landscape);
            assert.equal(await page.locator('.stage-back').isVisible(), landscape);
            assert.equal(await page.locator('.stage-live').isVisible(), landscape);
            assert.equal(await page.locator('.pc-clock').evaluate(el => getComputedStyle(el).zoom), '0.8');
            const transport = await page.locator('.transport').boundingBox();
            if (landscape) assert.ok(transport.x >= box.x + box.width);
            if (name === 'desktop') assert.ok(Math.abs(transport.x + transport.width / 2 - width / 2) < 1);
            if (process.env.TAPES_SCREENSHOTS) {
                await fs.mkdir(process.env.TAPES_SCREENSHOTS, { recursive: true });
                await page.screenshot({ path: path.join(process.env.TAPES_SCREENSHOTS, `${name}.png`) });
            }
        }
        // A pending edge tap must not toggle playback after navigation.
        await page.locator('.stage').dispatchEvent('pointerup', { pointerType: 'touch', clientX: 15, clientY: 30 });
        await page.locator('.stage-back').click();
        await page.waitForTimeout(350);
        assert.deepEqual(errors, []);
        console.log('PASS: live proxied playlist, epoch/RFC3339 playback 206, slots, ResizeObserver sizing, back link, transport, speed, keyboard/help, fullscreen, empty recordings, three layouts, no console errors');
        console.log('Decoded playback was not verified: bundled Chromium has no H.264 decoder.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
