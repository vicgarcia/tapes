import dayjs from 'dayjs';

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Local midnight of the day containing `ms`. */
export function startOfDay(ms: number): number {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

/** Local midnight `n` days after the day containing `ms` (DST safe). */
export function addDays(ms: number, n: number): number {
    const d = new Date(startOfDay(ms));
    d.setDate(d.getDate() + n);
    return d.getTime();
}

/** [start, end) of the local day containing `ms`. */
export function dayBounds(ms: number): [number, number] {
    return [startOfDay(ms), addDays(ms, 1)];
}

/** 'YYYY-MM-DD' of the local day containing `ms`. */
export function dayKey(ms: number): string {
    return dayjs(ms).format('YYYY-MM-DD');
}

/** Local midnight of a 'YYYY-MM-DD' day key. */
export function parseDayKey(key: string): number | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
}

export function isToday(ms: number): boolean {
    return startOfDay(ms) === startOfDay(Date.now());
}

/** RFC3339 with the local offset, e.g. 2026-10-24T00:00:00-04:00 (for day boundaries). */
export function toLocalRFC3339(ms: number): string {
    return dayjs(ms).format('YYYY-MM-DDTHH:mm:ssZ');
}

/** RFC3339 UTC with milliseconds, e.g. 2026-10-24T16:55:49.673Z (for exact instants). */
export function toUTCRFC3339(ms: number): string {
    return new Date(ms).toISOString();
}

export function parseTime(value: string): number {
    return Date.parse(value);
}

const clockFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
const shortTimeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const hourFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric' });
const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const longDateFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric' });

/** 1:05:42 PM */
export const formatClock = (ms: number) => clockFormat.format(ms);
/** 1:05 PM */
export const formatTime = (ms: number) => shortTimeFormat.format(ms);
/** 1 PM */
export const formatHour = (ms: number) => hourFormat.format(ms);
/** Sat, Oct 24 */
export const formatDate = (ms: number) => dateFormat.format(ms);
/** Sat 24 */
export const formatWeekday = (ms: number) => weekdayFormat.format(ms);

/** "Today", "Yesterday" or "Thursday, October 22" */
export function formatDay(ms: number): string {
    const today = startOfDay(Date.now());
    const day = startOfDay(ms);
    if (day === today) return 'Today';
    if (day === addDays(today, -1)) return 'Yesterday';
    if (day === addDays(today, 1)) return 'Tomorrow';
    return longDateFormat.format(ms);
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
