import { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Camera, PLAYBACK_RATES, PlaybackRate } from '@app/types';
import { getCamera } from '@app/services/cameras';
import { ApiError } from '@app/services/base';
import { addDays, formatDayShort, HOUR, MINUTE, SECOND, startOfDay } from '@app/lib/time';
import { useNow, usePoll } from '@app/hooks/usePoll';
import { Icon } from '@app/components/common/Icon';
import { CameraStatus } from '@app/components/cameras/CameraStatus';
import { playerTime, usePlayer } from './usePlayer';
import { Stage } from './Stage';
import { Clock, LiveButton, PlayOptions, Transport } from './Controls';
import { ShortcutsHelp } from './Shortcuts';
import { startTime } from './startTime';
import { useDayData } from './useDayData';
import { Timeline } from './Timeline';
import { DayStrip } from './DayStrip';
import { clampZoom, ZOOM_PRESETS } from './zoom';
import { DayChips } from '@app/components/common/DayChips';
import '@app/styles/player.css';

/** Route: /cameras/:name, optionally ?t=<epoch ms or RFC3339> to open at a recorded moment. */
export default function CameraView() {
    const { name = '' } = useParams();
    const [params] = useSearchParams();
    const camera = usePoll(signal => getCamera(name, signal), [name], 15 * SECOND);
    const t = params.get('t');
    const start = startTime(t);

    if (camera.type === 'loading') return <div className="player-page is-loading"><div className="spinner" /></div>;
    if (camera.type === 'error') {
        const missing = camera.error instanceof ApiError && camera.error.status === 404;
        return <main className="fullscreen-state">
            <span className="state-icon"><Icon name="camera" size={28} /></span>
            <h1>{missing ? 'No such camera' : 'Camera unavailable'}</h1>
            <p>{missing ? `There is no camera called “${name}”.` : 'Could not load this camera.'}</p>
            <Link to="/" className="btn btn-primary">All cameras</Link>
        </main>;
    }
    return <CameraPlayer key={`${name}|${t ?? ''}`} camera={camera.data} start={start} />;
}

const ZOOM_KEY = 'tapes.zoom';

function initialZoom(): number {
    try {
        const saved = Number(localStorage.getItem(ZOOM_KEY));
        if (saved > 0) return clampZoom(saved);
    } catch {
        // storage unavailable
    }
    return HOUR;
}

function CameraPlayer({ camera, start }: { camera: Camera, start: number | null }) {
    const player = usePlayer(camera, start);
    const { engine, state } = player;
    const now = useNow(1000);
    const [zoom, setZoomState] = useState(initialZoom);
    const [scrub, setScrub] = useState<number | null>(null);
    const [help, setHelp] = useState(false);

    const setZoom = useCallback((span: number) => {
        const next = clampZoom(span);
        setZoomState(next);
        try {
            localStorage.setItem(ZOOM_KEY, String(next));
        } catch {
            // storage unavailable
        }
    }, []);

    const time = playerTime(state, now);
    const display = scrub ?? time;
    const day = startOfDay(display);
    const viewStart = display - zoom / 2;
    const viewEnd = display + zoom / 2;

    // the days the timeline and the day strip need
    const firstDay = startOfDay(viewStart), lastDay = startOfDay(Math.min(viewEnd, now));
    const days = useMemo(() => {
        const list: number[] = [];
        for (let d = firstDay; d <= lastDay && list.length < 3; d = addDays(d, 1)) list.push(d);
        if (!list.includes(day)) list.push(day);
        return list;
    }, [firstDay, lastDay, day]);
    const data = useDayData(camera.name, days, now);

    const seek = useCallback((t: number) => engine.seek(t), [engine]);

    const dayEnd = addDays(day, 1);
    // day tiles keep the time of day, and never go past now
    const goToDay = (target: number) => engine.seek(Math.min(target + (display - day), Date.now()));

    useKeyboard(player, zoom, setZoom, time, () => setHelp(open => !open), help);

    const live = state.type === 'live';
    const dayLoaded = data.loaded.has(day);
    const noRecordings = dayLoaded && !data.spans.some(s => s.end > day && s.start < dayEnd);

    const aspect = camera.video ? camera.video.width / camera.video.height : 16 / 9;

    return <div className="player-page" style={{ '--ar': aspect } as React.CSSProperties}>
        <header className="player-header">
            <Link to="/" className="btn-icon" aria-label="All cameras" title="All cameras"><Icon name="arrowLeft" size={22} /></Link>
            <h1 className="player-title">{camera.name}</h1>
            <div className="player-actions">
                <LiveButton player={player} />
                <CameraStatus camera={camera} />
                <button className="btn-icon btn-shortcuts" onClick={() => setHelp(true)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
                    <Icon name="keyboard" size={20} />
                </button>
            </div>
        </header>

        <div className="player-stage">
            <Stage player={player}>
                <Link to="/" className="stage-back btn-icon" aria-label="All cameras"><Icon name="arrowLeft" size={22} /></Link>
                <div className="stage-live"><LiveButton player={player} /></div>
            </Stage>
        </div>

        <section className="player-controls" aria-label="Playback controls">
            <div className="pc-clock"><Clock player={player} time={display} scrubbing={scrub !== null} /></div>
            <div className="pc-daynav"><DayChips selected={day} onSelect={goToDay} label="Recording day" /></div>
            <div className="pc-strip">
                <DayStrip day={day} time={display} viewStart={viewStart} viewEnd={viewEnd} now={now}
                    spans={data.spans} onScrub={setScrub} onSeek={seek} />
            </div>
            <div className="pc-timeline">
                <Timeline center={display} zoom={zoom} now={Date.now()} spans={data.spans}
                    live={live && scrub === null} onScrub={setScrub} onSeek={seek} onZoom={setZoom} />
                {noRecordings && <div className="timeline-empty">No recordings on {formatDayShort(day)}</div>}
            </div>
            <div className="pc-transport"><Transport player={player} /></div>
            <div className="pc-options"><PlayOptions player={player} zoom={zoom} onZoom={setZoom} /></div>
        </section>

        {help && <ShortcutsHelp onClose={() => setHelp(false)} />}
    </div>;
}

/** Shortcuts ignore editable fields and are suspended while help is open. */
function useKeyboard(player: ReturnType<typeof usePlayer>, zoom: number, setZoom: (z: number) => void, time: number, toggleHelp: () => void, help: boolean) {
    const latest = useRef({ player, zoom, setZoom, time, toggleHelp, help });
    latest.current = { player, zoom, setZoom, time, toggleHelp, help };
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const { player: { engine, state }, zoom, setZoom, time, toggleHelp, help } = latest.current;
            if (help) return;
            const target = e.target as HTMLElement;
            if (target.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
            const rate = PLAYBACK_RATES.indexOf(state.rate);
            const day = startOfDay(time);
            switch (e.key) {
                case ' ': case 'k': case 'K':
                    if (target.closest('button') && e.key === ' ') return;   // let the focused button handle space
                    engine.toggle(); break;
                case 'ArrowLeft': case 'j': case 'J': engine.skip(e.shiftKey ? -MINUTE : -10 * SECOND); break;
                case 'ArrowRight': engine.skip(e.shiftKey ? MINUTE : 10 * SECOND); break;
                case '[': case '<': case ',': engine.setRate(PLAYBACK_RATES[Math.max(0, rate - 1)]); break;
                case ']': case '>': case '.': engine.setRate(PLAYBACK_RATES[Math.min(PLAYBACK_RATES.length - 1, rate + 1)]); break;
                case 'l': case 'L': engine.goLive(); break;
                case '+': case '=': setZoom(zoom / 2); break;
                case '-': case '_': setZoom(zoom * 2); break;
                case 'PageUp': engine.seek(addDays(day, -1) + (time - day)); break;
                case 'PageDown': engine.seek(Math.min(Date.now(), addDays(day, 1) + (time - day))); break;
                case '1': case '2': case '4': engine.setRate(Number(e.key) as PlaybackRate); break;
                case 'z': case 'Z': {
                    const current = ZOOM_PRESETS.findIndex(p => Math.abs(Math.log(zoom / p.span)) < 0.35);
                    setZoom(ZOOM_PRESETS[(current + 1) % ZOOM_PRESETS.length].span);
                    break;
                }
                case '?': toggleHelp(); break;
                case 'f': case 'F': (document.querySelector('.stage-fullscreen') as HTMLButtonElement | null)?.click(); break;
                default: return;
            }
            e.preventDefault();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);
}
