// Run against the synthetic test stack with a separate Vite server:
// TAPES_UI_URL=http://127.0.0.1:15173 TAPES_API_CONTAINER=ui17-tapes-1 node test/ui-foundation.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdirSync } = require('node:fs');

(async () => {
    const url = process.env.TAPES_UI_URL;
    const api = process.env.TAPES_API_CONTAINER;
    assert.ok(url && api, 'Set TAPES_UI_URL and TAPES_API_CONTAINER for the disposable test stack');
    const browser = await chromium.launch();
    const screenshots = process.env.TAPES_SCREENSHOTS;
    if (screenshots) mkdirSync(screenshots, { recursive: true });
    try {
        for (const [size, viewport] of Object.entries({ desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } })) {
            const context = await browser.newContext({ viewport });
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            const shot = async state => {
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
                if (screenshots) await page.screenshot({ path: `${screenshots}/${size}-${state}.png` });
            };
            await page.goto(url);
            await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
            await shot('login');
            await page.getByRole('button', { name: 'Sign in', exact: true }).click();
            await page.getByText('Enter your username').waitFor();
            await page.getByLabel('Username').fill('test');
            await page.getByLabel('Password').fill('wrong');
            await page.getByRole('button', { name: 'Sign in', exact: true }).click();
            await page.getByText('Wrong username or password').waitFor();
            await page.getByLabel('Password').fill('test');
            await page.getByRole('button', { name: 'Sign in', exact: true }).click();
            await page.getByText('Camera home is coming next.').waitFor();
            assert.equal(await page.locator('nav').count(), 0);
            assert.equal(await page.locator('a.brand').count(), 0);
            const brand = await page.locator('.brand').boundingBox();
            const heading = await page.getByRole('heading', { name: 'Cameras', exact: true }).boundingBox();
            assert.equal(brand.x, heading.x);
            await shot('home');
            await page.reload();
            await page.getByText('Camera home is coming next.').waitFor();
            await page.getByRole('link', { name: 'Sign out' }).click();
            await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
            await page.goto(`${url}/#/cameras/test`);
            await page.getByLabel('Username').fill('test');
            await page.getByLabel('Password').fill('test');
            await page.getByRole('button', { name: 'Sign in', exact: true }).click();
            await page.getByText('The camera player is coming next.').waitFor();
            await page.getByRole('link', { name: 'Back to cameras' }).click();
            await page.getByText('Camera home is coming next.').waitFor();
            execFileSync('docker', ['stop', api]);
            await page.getByRole('heading', { name: "Can't reach Tapes" }).waitFor({ timeout: 25000 });
            await page.getByRole('button', { name: 'Try again' }).click();
            await page.getByRole('button', { name: 'Try again' }).waitFor();
            await shot('offline');
            execFileSync('docker', ['start', api]);
            await page.getByRole('button', { name: 'Try again' }).click();
            await page.getByText('Camera home is coming next.').waitFor();
            assert.deepEqual(errors, []);
            await context.close();
            console.log(`PASS: ${size} login, validation, session, logout, protected player, offline and recovery`);
        }
    } finally {
        execFileSync('docker', ['start', api]);
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
