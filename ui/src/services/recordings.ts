import { getJSON, withQuery } from './base';
import { Clip, Span } from '@app/types';
import { dayBounds, parseTime, toLocalRFC3339, toUTCRFC3339 } from '@app/lib/time';

type ApiSpans = {
    spans: { start: string, end: string, duration: number }[]
}

/** The API serves at most 10 minutes per playback request. */
export const MAX_CLIP_SECONDS = 600;

/** Recorded spans overlapping [start, end) (at most 7 days), clipped to the window. */
export async function getSpans(camera: string, start: number, end: number, signal?: AbortSignal): Promise<Span[]> {
    const url = withQuery(`/cameras/${encodeURIComponent(camera)}/recordings`, {
        start: toLocalRFC3339(start),
        end: toLocalRFC3339(end),
    });
    const response = await getJSON<ApiSpans>(url, signal);
    return response.spans.map(s => ({
        type: 'span' as const,
        camera,
        start: parseTime(s.start),
        end: parseTime(s.end),
    }));
}

/** Recorded spans for the local day containing `day`, using local-midnight boundaries. */
export function getSpansForDay(camera: string, day: number, signal?: AbortSignal): Promise<Span[]> {
    const [start, end] = dayBounds(day);
    return getSpans(camera, start, end, signal);
}

/** MP4 url for a clip, usable directly as a <video> src (cookie auth, Range support). */
export function getClipUrl(clip: Clip): string {
    const duration = Math.max(1, Math.min(MAX_CLIP_SECONDS, Math.round(clip.duration * 1000) / 1000));
    return withQuery(`/cameras/${encodeURIComponent(clip.camera)}/playback`, {
        start: toUTCRFC3339(clip.start),
        duration,
    });
}

/** Build a clip, clamping the duration to what the API accepts. */
export function makeClip(camera: string, start: number, durationSeconds: number): Clip {
    return {
        type: 'clip',
        camera,
        start: Math.round(start),
        duration: Math.max(1, Math.min(MAX_CLIP_SECONDS, durationSeconds)),
    };
}
