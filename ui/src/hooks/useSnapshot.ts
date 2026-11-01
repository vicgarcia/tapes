import { useEffect, useRef, useState } from 'react';
import { Camera, Snapshot } from '@app/types';
import { getSnapshot } from '@app/services/cameras';
import { isAbort } from '@app/services/base';
import { SECOND } from '@app/lib/time';

const REFRESH_MS = 5 * SECOND;

export type SnapshotState =
    | { type: 'loading' }
    | { type: 'none' }
    | { type: 'ready', snapshot: Snapshot }

/**
 * Keeps a camera's snapshot fresh: every 5s (or `refreshMs`, null = once)
 * while `active` (tile on screen and page visible), paused otherwise. The new image is decoded before it
 * replaces the old one so tiles never flash.
 */
export function useSnapshot(camera: Camera, active: boolean, refreshMs: number | null = REFRESH_MS): SnapshotState {
    const [state, setState] = useState<SnapshotState>({ type: 'loading' });
    const current = useRef<string | null>(null);

    useEffect(() => {
        if (!active) return;
        const controller = new AbortController();
        let timer: number | undefined;
        const run = async () => {
            try {
                const snapshot = await getSnapshot(camera, controller.signal);
                if (controller.signal.aborted) {
                    if (snapshot) URL.revokeObjectURL(snapshot.url);
                    return;
                }
                if (snapshot === null) {
                    if (current.current) URL.revokeObjectURL(current.current);
                    current.current = null;
                    setState({ type: 'none' });
                } else {
                    const img = new Image();
                    img.src = snapshot.url;
                    try {
                        await img.decode();
                    } catch (error) {
                        URL.revokeObjectURL(snapshot.url);
                        throw error;
                    }
                    if (controller.signal.aborted) return URL.revokeObjectURL(snapshot.url);
                    const previous = current.current;
                    current.current = snapshot.url;
                    setState({ type: 'ready', snapshot });
                    if (previous) window.setTimeout(() => URL.revokeObjectURL(previous), 1000);
                }
            } catch (error) {
                if (controller.signal.aborted || isAbort(error)) return;
                // Keep the last good image, or show the no-frame state on first failure.
                if (!current.current) setState({ type: 'none' });
            }
            if (!controller.signal.aborted && refreshMs !== null) timer = window.setTimeout(run, refreshMs);
        };
        run();
        return () => {
            controller.abort();
            window.clearTimeout(timer);
        };
    // A refreshed camera object (status poll) must not restart the loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [camera.name, active, refreshMs]);

    useEffect(() => () => {
        if (current.current) URL.revokeObjectURL(current.current);
    }, []);

    return state;
}
