import { ApiError, getJSON, request } from './base';
import { Camera, Snapshot } from '@app/types';
import { parseTime } from '@app/lib/time';

type ApiCamera = {
    name: string
    online: boolean
    video: { codec: string, width: number, height: number } | null
}

function toCamera(c: ApiCamera): Camera {
    return {
        type: 'camera',
        name: c.name,
        online: c.online,
        video: c.video,
    };
}

const path = (name: string) => `/cameras/${encodeURIComponent(name)}`;

export async function getCameras(signal?: AbortSignal): Promise<Camera[]> {
    const cameras = await getJSON<ApiCamera[]>('/cameras', signal);
    return cameras.map(toCamera);
}

export async function getCamera(name: string, signal?: AbortSignal): Promise<Camera> {
    return toCamera(await getJSON<ApiCamera>(path(name), signal));
}

/** hls.js / native HLS source for the live view. */
export function getLiveUrl(camera: Camera | string): string {
    return `${path(typeof camera === 'string' ? camera : camera.name)}/live/index.m3u8`;
}

/**
 * Fetch the current still for a camera tile. Fetched (rather than used as an
 * <img src>) so the tile can read X-Snapshot-Time and tell a stale image apart.
 * Resolves null when the camera has no snapshot (404).
 */
export async function getSnapshot(camera: Camera, signal?: AbortSignal): Promise<Snapshot | null> {
    try {
        const response = await request(`${path(camera.name)}/snapshot?t=${Date.now()}`, { signal });
        const blob = await response.blob();
        const time = response.headers.get('X-Snapshot-Time');
        return {
            type: 'snapshot',
            camera: camera.name,
            url: URL.createObjectURL(blob),
            time: time ? parseTime(time) : null,
        };
    } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
    }
}
