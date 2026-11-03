// Calendar days, clock labels and day boundaries use the app time zone, which
// the server reports from /health, so the timeline matches the cameras'
// location and the server logs whatever the viewer's device is set to. Until
// one is set (or if the server reports none), the browser's zone is used.

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

let zone: string | undefined;
let formats = new Map<string, Intl.DateTimeFormat>();

/** Use `timeZone` (an IANA name such as America/New_York) for all dates; ignores names the browser doesn't know. */
export function setTimeZone(timeZone: string | null | undefined): void {
    const next = timeZone || undefined;
    if (next) {
        try {
            new Intl.DateTimeFormat(undefined, { timeZone: next });
        } catch {
            console.warn('unknown time zone, using the browser zone', next);
            return;
        }
    }
    if (next === zone) return;
    zone = next;
    formats = new Map();
}

/** The app time zone's IANA name. */
export function getTimeZone(): string {
    return zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** A formatter in the app time zone, cached per options. */
function format(options: Intl.DateTimeFormatOptions, locale?: string): Intl.DateTimeFormat {
    const key = `${locale ?? ''}|${JSON.stringify(options)}`;
    let f = formats.get(key);
    if (!f) {
        f = new Intl.DateTimeFormat(locale, { ...options, timeZone: zone });
        formats.set(key, f);
    }
    return f;
}

type WallClock = { year: number, month: number, day: number, hour: number, minute: number, second: number }

/** The wall-clock reading of `ms` in the app time zone. */
function wallClock(ms: number): WallClock {
    const parts = format({ year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }, 'en-US')
        .formatToParts(ms);
    const get = (type: string) => Number(parts.find(p => p.type === type)?.value);
    return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24, minute: get('minute'), second: get('second') };
}

/** Offset of the app time zone from UTC at `ms`, in ms (e.g. -4h for EDT). */
function offsetAt(ms: number): number {
    const w = wallClock(ms);
    return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - (ms - (((ms % 1000) + 1000) % 1000));
}

/**
 * The instant a wall-clock time occurs in the app time zone. Day and hour may
 * overflow (day 32 is the 1st of next month). A time skipped by a DST jump
 * resolves to just after the jump; a repeated one to its first occurrence.
 */
function fromWallClock(year: number, month: number, day: number, hour = 0): number {
    const target = Date.UTC(year, month - 1, day, hour);
    const a = target - offsetAt(target);
    const b = target - offsetAt(a);
    const reads = (t: number) => {
        const w = wallClock(t);
        return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) === target;
    };
    const matches = [a, b].filter(reads);
    return matches.length ? Math.min(...matches) : Math.max(a, b);
}

/** Midnight, in the app time zone, of the day containing `ms`. */
export function startOfDay(ms: number): number {
    const w = wallClock(ms);
    return fromWallClock(w.year, w.month, w.day);
}

/** Midnight `n` days after the day containing `ms` (DST safe). */
export function addDays(ms: number, n: number): number {
    const w = wallClock(ms);
    return fromWallClock(w.year, w.month, w.day + n);
}

/** `hour` o'clock on the day containing `ms` (DST safe). */
export function atHour(ms: number, hour: number): number {
    const w = wallClock(ms);
    return fromWallClock(w.year, w.month, w.day, hour);
}

/** [start, end) of the day containing `ms`. */
export function dayBounds(ms: number): [number, number] {
    return [startOfDay(ms), addDays(ms, 1)];
}

/** Day of the month of `ms`. */
export function dayOfMonth(ms: number): number {
    return wallClock(ms).day;
}

const pad = (n: number, width = 2) => String(Math.abs(n)).padStart(width, '0');

/** 'YYYY-MM-DD' of the day containing `ms`. */
export function dayKey(ms: number): string {
    const w = wallClock(ms);
    return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}`;
}

/** Midnight of a 'YYYY-MM-DD' day key. */
export function parseDayKey(key: string): number | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!m) return null;
    return fromWallClock(+m[1], +m[2], +m[3]);
}

export function isToday(ms: number): boolean {
    return startOfDay(ms) === startOfDay(Date.now());
}

/** RFC3339 in the app time zone, e.g. 2026-10-24T00:00:00-04:00 (for day boundaries). */
export function toLocalRFC3339(ms: number): string {
    const w = wallClock(ms);
    const offset = Math.round(offsetAt(ms) / MINUTE);
    const sign = offset < 0 ? '-' : '+';
    return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}:${pad(w.second)}`
        + `${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`;
}

/** RFC3339 UTC with milliseconds, e.g. 2026-10-24T16:55:49.673Z (for exact instants). */
export function toUTCRFC3339(ms: number): string {
    return new Date(ms).toISOString();
}

export function parseTime(value: string): number {
    return Date.parse(value);
}

/** 1:05:42 PM */
export const formatClock = (ms: number) => format({ hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(ms);
/** 1:05 PM */
export const formatTime = (ms: number) => format({ hour: 'numeric', minute: '2-digit' }).format(ms);
/** 1 PM */
export const formatHour = (ms: number) => format({ hour: 'numeric' }).format(ms);
/** Sat, Oct 24 */
export const formatDate = (ms: number) => format({ weekday: 'short', month: 'short', day: 'numeric' }).format(ms);
/** Saturday, October 24 */
export const formatLongDate = (ms: number) => format({ weekday: 'long', month: 'long', day: 'numeric' }).format(ms);
/** Sat 24 */
export const formatWeekday = (ms: number) => format({ weekday: 'short', day: 'numeric' }).format(ms);
/** Sat */
export const formatWeekdayShort = (ms: number) => format({ weekday: 'short' }).format(ms);

/** "Today", "Yesterday" or "Thursday, October 22" */
export function formatDay(ms: number): string {
    const today = startOfDay(Date.now());
    const day = startOfDay(ms);
    if (day === today) return 'Today';
    if (day === addDays(today, -1)) return 'Yesterday';
    if (day === addDays(today, 1)) return 'Tomorrow';
    return formatLongDate(ms);
}

/** "Today", "Yesterday" or "Sat, Oct 24" */
export function formatDayShort(ms: number): string {
    const label = formatDay(ms);
    return label === 'Today' || label === 'Yesterday' ? label : formatDate(ms);
}

/** 7s, 2m 28s, 1h 04m */
export function formatDuration(ms: number): string {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${String(m % 60).padStart(2, '0')}m`;
}

/** "just now", "12s ago", "5 min ago", "3 h ago", "2 days ago" */
export function formatAgo(ms: number, now = Date.now()): string {
    const s = Math.round((now - ms) / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return `${s}s ago`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 48) return `${h} h ago`;
    return `${Math.round(h / 24)} days ago`;
}

/** m:ss for clip-relative positions */
export function formatOffset(ms: number): string {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
