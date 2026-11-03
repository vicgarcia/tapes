import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const { outputFiles } = await build({
    entryPoints: ['src/lib/time.ts'],
    bundle: true, write: false, format: 'esm',
    tsconfig: 'tsconfig.app.json',
});
const time = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const HOUR = 3600_000;

test('days, hours and offsets follow the app time zone, not the device', () => {
    time.setTimeZone('America/New_York');
    assert.equal(time.getTimeZone(), 'America/New_York');
    // 03:00Z on Nov 3 is still Nov 2 in New York (EST, -5).
    const late = Date.UTC(2026, 10, 3, 3);
    assert.equal(time.startOfDay(late), Date.UTC(2026, 10, 2, 5));
    assert.equal(time.dayKey(late), '2026-11-02');
    assert.equal(time.dayOfMonth(late), 2);
    assert.equal(time.toLocalRFC3339(Date.UTC(2026, 9, 24, 4)), '2026-10-24T00:00:00-04:00');
    assert.equal(time.parseDayKey('2026-10-24'), Date.UTC(2026, 9, 24, 4));
    assert.match(time.formatClock(Date.UTC(2026, 9, 24, 17, 5, 42)), /^1:05:42\s?PM$/);
});

test('days stay calendar days across DST changes', () => {
    time.setTimeZone('America/New_York');
    // Clocks fall back on Nov 1 2026, so that day is 25 hours long.
    const oct31 = time.startOfDay(Date.UTC(2026, 9, 31, 12));
    assert.equal(oct31, Date.UTC(2026, 9, 31, 4));
    assert.equal(time.addDays(oct31, 1), Date.UTC(2026, 10, 1, 4));
    assert.equal(time.addDays(oct31, 2), Date.UTC(2026, 10, 2, 5));
    assert.equal(time.addDays(oct31, 2) - time.addDays(oct31, 1), 25 * HOUR);
    // 6 AM on the fall-back day is after the change, in EST.
    assert.equal(time.atHour(time.addDays(oct31, 1), 6), Date.UTC(2026, 10, 1, 11));
    assert.equal(time.toLocalRFC3339(Date.UTC(2026, 10, 2, 5)), '2026-11-02T00:00:00-05:00');
});

test('a day that starts after a skipped midnight begins at its first instant', () => {
    // Santiago skips from 00:00 to 01:00 when DST starts in September.
    time.setTimeZone('America/Santiago');
    for (let d = 1; d <= 12; d++) {
        const start = time.startOfDay(Date.UTC(2026, 8, d, 18));
        assert.equal(time.dayKey(start), `2026-09-${String(d).padStart(2, '0')}`);
        assert.equal(time.dayKey(start - 1), `2026-09-${String(d - 1 || 31).padStart(2, '0')}`.replace('2026-09-31', '2026-08-31'));
    }
});

test('unknown or missing zones fall back to the browser zone', () => {
    time.setTimeZone('America/New_York');
    time.setTimeZone('Not/AZone');
    assert.equal(time.getTimeZone(), 'America/New_York');
    time.setTimeZone(undefined);
    assert.equal(time.getTimeZone(), Intl.DateTimeFormat().resolvedOptions().timeZone);
});
