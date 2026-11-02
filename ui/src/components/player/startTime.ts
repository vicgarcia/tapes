/** Parse a deep-link time, falling back to live for invalid input. */
export function startTime(value: string | null): number | null {
    if (!value?.trim()) return null;
    const time = /^-?\d+$/.test(value) ? Number(value) : Date.parse(value);
    return Number.isFinite(time) && !Number.isNaN(new Date(time).getTime()) ? time : null;
}
