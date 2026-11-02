import { Icon } from '@app/components/common/Icon';
import { PLAYBACK_RATES } from '@app/types';
import { formatClock, formatDayShort, MINUTE } from '@app/lib/time';
import { Player } from './usePlayer';
import { ZOOM_PRESETS } from './zoom';

/** Big wall-clock readout of the playhead. */
export function Clock({ player, time, scrubbing }: { player: Player, time: number, scrubbing: boolean }) {
    const { state } = player;
    const status = scrubbing ? 'Release to play from here' : state.type === 'live' ? (state.status === 'playing' ? 'Live' : state.status === 'error' ? 'Live unavailable' : state.status === 'stalled' ? 'Buffering…' : 'Connecting…')
        : state.status === 'loading' ? 'Loading…'
        : state.status === 'buffering' ? 'Buffering…'
        : state.status === 'end' ? 'No recording'
        : state.playing ? (state.rate === 1 ? 'Playing' : `Playing ${state.rate}×`) : 'Paused';

    return <div className={`clock${scrubbing ? ' is-scrubbing' : ''}`}>
        <time className="clock-time" dateTime={new Date(time).toISOString()}>{formatClock(time)}</time>
        <div className="clock-meta">
            <span className="clock-date">{formatDayShort(time)}</span>
            <span className={`clock-status${state.type === 'live' && !scrubbing ? ' is-live' : ''}`}>{status}</span>
        </div>
    </div>;
}

/** Play/pause and skips. */
export function Transport({ player }: { player: Player }) {
    const { engine, state } = player;
    const live = state.type === 'live';
    const playing = live || state.playing;

    return <div className="transport">
        <button className="btn-icon" onClick={() => engine.skip(-MINUTE)} aria-label="Back 1 minute" title="Back 1 minute (Shift+←)">
            <Icon name="rewind" size={20} /><span className="btn-sub">1m</span>
        </button>
        <button className="btn-icon" onClick={() => engine.skip(-10_000)} aria-label="Back 10 seconds" title="Back 10s (←)">
            <Icon name="back10" size={24} />
        </button>
        <button className="btn-play" onClick={() => engine.toggle()} aria-label={playing ? 'Pause' : 'Play'} title="Play / pause (Space)">
            <Icon name={playing ? 'pause' : 'play'} size={20} />
        </button>
        <button className="btn-icon" onClick={() => engine.skip(10_000)} disabled={live} aria-label="Forward 10 seconds" title="Forward 10s (→)">
            <Icon name="fwd10" size={24} />
        </button>
        <button className="btn-icon" onClick={() => engine.skip(MINUTE)} disabled={live} aria-label="Forward 1 minute" title="Forward 1 minute (Shift+→)">
            <Icon name="forward" size={20} /><span className="btn-sub">1m</span>
        </button>
    </div>;
}

/** Live indicator while live, otherwise the button that jumps back to it (in the header). */
export function LiveButton({ player }: { player: Player }) {
    const { engine, state, camera } = player;
    const live = state.type === 'live';

    return <button className={`btn-live${live ? ' is-live' : ''}`} onClick={() => engine.goLive()} disabled={live || !camera.online}
        aria-label="Jump to live" title="Live (L)">
        <span className="live-dot" />Live
    </button>;
}

/** Segmented playback speed controls. */
export function PlayOptions({ player, zoom, onZoom }: { player: Player, zoom: number, onZoom: (span: number) => void }) {
    const { engine, state } = player;
    const live = state.type === 'live';

    return <div className="play-options">
        <div className="segmented" role="group" aria-label="Playback speed" title={live ? 'Speed applies to recordings' : 'Speed ( [ and ] )'}>
            {PLAYBACK_RATES.map(rate => <button
                key={rate}
                className={state.rate === rate ? 'is-active' : undefined}
                aria-pressed={state.rate === rate}
                onClick={() => engine.setRate(rate)}
            >{rate}×</button>)}
        </div>
        <div className="segmented" role="group" aria-label="Timeline zoom" title="Zoom (+ / − / Z)">
            {ZOOM_PRESETS.map(preset => {
                const active = Math.abs(Math.log(zoom / preset.span)) < 0.35;
                return <button key={preset.label} className={active ? 'is-active' : undefined} aria-pressed={active}
                    onClick={() => onZoom(preset.span)}>{preset.label}</button>;
            })}
        </div>
    </div>;
}
