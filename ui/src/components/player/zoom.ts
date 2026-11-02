import { DAY, HOUR, MINUTE } from '@app/lib/time';

/** Visible duration of the timeline, bounded so it stays usable. */
export const MIN_ZOOM = 2 * MINUTE;
export const MAX_ZOOM = DAY;

export const ZOOM_PRESETS = [
    { label: '24h', span: DAY },
    { label: '1h', span: HOUR },
    { label: '10m', span: 10 * MINUTE },
];

export const clampZoom = (span: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, span));
