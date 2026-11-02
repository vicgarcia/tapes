// Optional browser regression against the synthetic test stack (Playwright required).
// TAPES_TEST_URL=http://localhost:18671 node test/player-timeline-browser.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
    const base = process.env.TAPES_TEST_URL || 'http://localhost:18671';
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        const errors = [];
        const requests = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => requests.push(new URL(request.url())));
        await page.goto(base);
        await page.getByLabel('Username').fill('test');
        await page.getByLabel('Password', { exact: true }).fill('test');
        await page.getByRole('button', { name: 'Sign in' }).click();
        await page.goto(`${base}/#/cameras/test`);
        await page.waitForSelector('.tl-span');
        assert.equal(await page.locator('.player-side').count(), 0);
        await page.getByRole('button', { name: '10m', exact: true }).click();
        assert.equal(await page.evaluate(() => localStorage.getItem('tapes.zoom')), '600000');
        await page.reload();
        await page.waitForSelector('.tl-span');
        assert.equal(await page.getByRole('button', { name: '10m', exact: true }).getAttribute('aria-pressed'), 'true');

        // Today's recorded bar grows between polls and refetches every 30 seconds.
        const initial = Number(await page.locator('.ds-span').last().getAttribute('width'));
        const count = requests.filter(url => url.pathname.endsWith('/recordings')).length;
        await page.waitForTimeout(32000);
        assert.ok(Number(await page.locator('.ds-span').last().getAttribute('width')) > initial);
        assert.ok(requests.filter(url => url.pathname.endsWith('/recordings')).length > count);

        // A tap thirty seconds left of the playhead must request that moment (with the engine’s existing ten-second preroll).
        const timeline = page.getByRole('slider', { name: 'Timeline', exact: true });
        const center = Number(await timeline.getAttribute('aria-valuenow')) * 1000;
        const box = await timeline.boundingBox();
        const playback = page.waitForRequest(request => request.url().includes('/playback?'));
        await page.mouse.click(box.x + box.width / 2 - box.width * 30000 / 600000, box.y + 38);
        const url = new URL((await playback).url());
        assert.ok(Math.abs(Date.parse(url.searchParams.get('start')) - (center - 40000)) < 2000, url.href);

        // Day selection fetches local midnight boundaries and shows the empty-day message.
        const dayRequest = page.waitForRequest(request => {
            const url = new URL(request.url());
            return url.pathname.endsWith('/recordings') && new Date(url.searchParams.get('start')).getHours() === 0 && Date.parse(url.searchParams.get('end')) <= new Date().setHours(0, 0, 0, 0);
        });
        await page.locator('.day-chip').nth(2).click();
        const dayUrl = new URL((await dayRequest).url());
        assert.equal(new Date(dayUrl.searchParams.get('start')).getHours(), 0);
        await page.waitForSelector('.timeline-empty');
        assert.match(await page.locator('.timeline-empty').innerText(), /No recordings on/);
        // The unzoomed strip maps its own width to the entire local day.
        const selected = Number(await page.getByRole('slider', { name: 'Timeline', exact: true }).getAttribute('aria-valuenow')) * 1000;
        const day = new Date(selected); day.setHours(0, 0, 0, 0);
        const next = new Date(day); next.setDate(next.getDate() + 1);
        const overview = await page.getByRole('slider', { name: 'Day overview' }).boundingBox();
        await page.mouse.click(overview.x + overview.width / 4, overview.y + 6);
        await page.waitForTimeout(500);
        const tapped = Number(await page.getByRole('slider', { name: 'Timeline', exact: true }).getAttribute('aria-valuenow')) * 1000;
        assert.ok(Math.abs(tapped - (+day + (+next - +day) / 4)) < (+next - +day) / overview.width);
        await page.getByRole('slider', { name: 'Timeline', exact: true }).hover();
        await page.mouse.wheel(0, -100);
        await page.waitForTimeout(100);
        assert.ok(Number(await page.evaluate(() => localStorage.getItem('tapes.zoom'))) < 600000);
        await page.getByRole('button', { name: '10m', exact: true }).click();
        const before = await page.locator('.day-chip').count();
        await page.locator('.day-chips').evaluate(el => { el.scrollLeft = el.scrollWidth; });
        await page.waitForFunction(n => document.querySelectorAll('.day-chip').length > n, before);
        await page.keyboard.press('z');
        assert.equal(await page.evaluate(() => localStorage.getItem('tapes.zoom')), '86400000');
        await page.keyboard.press('PageDown');
        await page.waitForTimeout(300);

        // A second camera uses only a metadata fixture; switching links retain playback time.
        const cameras = await (await page.request.get(`${base}/cameras`)).json();
        await page.route('**/cameras', route => route.fulfill({ json: [...cameras, { ...cameras[0], name: 'other', online: false }] }));
        await page.goto(`${base}/#/cameras/test?t=${Date.now() - 60000}`);
        await page.waitForSelector('.camera-strip');
        const at = Number(await page.getByRole('slider', { name: 'Timeline', exact: true }).getAttribute('aria-valuenow')) * 1000;
        const link = await page.locator('.mini-tile').last().getAttribute('href');
        const carried = Number(new URL(link.split('#')[1], base).searchParams.get('t'));
        assert.ok(Math.abs(at - carried) < 2000);
        await page.getByRole('button', { name: 'Jump to live' }).first().click();
        await page.waitForTimeout(300);
        assert.ok(!(await page.locator('.mini-tile').last().getAttribute('href')).includes('?t='));
        await page.unroute('**/cameras');
        await page.goto(`${base}/#/cameras/test`);
        await page.waitForSelector('.tl-span');
        await page.getByRole('button', { name: '10m', exact: true }).click();
        if (process.env.SCREENSHOT_DIR) {
            for (const [name, width, height] of [['desktop', 1440, 1000], ['phone-portrait', 390, 844], ['phone-landscape', 844, 390]]) {
                await page.setViewportSize({ width, height });
                await page.waitForTimeout(700);
                await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/${name}.png` });
            }
        }
        assert.deepEqual(errors, []);
        console.log('PASS: timeline growth, refresh, seeking, days, infinite tiles, persisted zoom, shortcuts, camera links and responsive screenshots');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
