import { useState, useSyncExternalStore } from 'react';
import { Camera } from '@app/types';
import { PlayerEngine, PlayerState } from './engine';

/** Everything the player's child components need, in one self-contained object. */
export type Player = {
    camera: Camera
    engine: PlayerEngine
    state: PlayerState
}

/**
 * One engine per mounted camera view. `start` is the wall-clock time to open
 * at, or null for live. (The view is keyed by camera, so a new camera gets a
 * new engine.)
 */
export function usePlayer(camera: Camera, start: number | null): Player {
    const [engine] = useState(() => new PlayerEngine(camera.name, start));
    const state = useSyncExternalStore(engine.subscribe, engine.getState);
    return { camera, engine, state };
}

/** Wall-clock time the player is showing (live without a frame time yet → now). */
export function playerTime(state: PlayerState, now = Date.now()): number {
    return state.time ?? now;
}
