import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '@app/components/common/Icon';
import { Player } from './usePlayer';

// The video surface: one live element and two playback slots stacked on top
// of each other (the engine shows one at a time), plus status overlays.
// Single tap toggles play/pause; double tap on the left/right third skips 10s.

type StageProps = {
    player: Player
    children?: ReactNode     // extra overlays (back and live buttons in landscape)
}

const DOUBLE_TAP_MS = 280;
// Keep the last frame behind the loading indicator.
const SPINNER = <div className="spinner" role="status" aria-label="Loading" />;

export function Stage({ player, children }: StageProps) {
    const { engine, state, camera } = player;
    const stageRef = useRef<HTMLDivElement>(null);
    const liveRef = useRef<HTMLVideoElement>(null);
    const aRef = useRef<HTMLVideoElement>(null);
    const bRef = useRef<HTMLVideoElement>(null);
    const lastTap = useRef<{ t: number, timer: number, side: string } | null>(null);
    const [ripple, setRipple] = useState<{ id: number, side: 'left' | 'right' | 'center', icon: 'back10' | 'fwd10' | 'play' | 'pause' } | null>(null);

    useEffect(() => {
        engine.attach(liveRef.current!, aRef.current!, bRef.current!);
        const onFullscreen = () => {
            if (!document.fullscreenElement) (screen.orientation as LockableOrientation | undefined)?.unlock?.();
        };
        document.addEventListener('fullscreenchange', onFullscreen);
        return () => {
            if (lastTap.current) window.clearTimeout(lastTap.current.timer);
            document.removeEventListener('fullscreenchange', onFullscreen);
            engine.detach();
        };
    }, [engine]);

    // Largest box of the camera's aspect ratio that fits the stage cell, as
    // --fit-w/--fit-h for every layout. Measured
    // here rather than with CSS size containment: container-type: size on the
    // video's ancestor made Edge stall playback while the page re-rendered.
    const ratio = camera.video ? camera.video.width / camera.video.height : 16 / 9;
    useLayoutEffect(() => {
        const stage = stageRef.current;
        const cell = stage?.parentElement;
        if (!stage || !cell) return;
        const fit = () => {
            const w = Math.min(cell.clientWidth, cell.clientHeight * ratio);
            stage.style.setProperty('--fit-w', `${Math.floor(w)}px`);
            stage.style.setProperty('--fit-h', `${Math.floor(w / ratio)}px`);
        };
        const observer = new ResizeObserver(fit);
        observer.observe(cell);
        fit();
        return () => observer.disconnect();
    }, [ratio]);

    const flash = (side: 'left' | 'right' | 'center', icon: 'back10' | 'fwd10' | 'play' | 'pause') => {
        setRipple({ id: Date.now(), side, icon });
    };

    const onTap = (e: React.PointerEvent) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if ((e.target as Element).closest('button, a')) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const third = (e.clientX - rect.left) / rect.width;
        const side = third < 1 / 3 ? 'left' : third > 2 / 3 ? 'right' : 'center';
        const previous = lastTap.current;
        if (previous && e.timeStamp - previous.t < DOUBLE_TAP_MS && side === previous.side && side !== 'center') {
            window.clearTimeout(previous.timer);
            lastTap.current = null;
            engine.skip(side === 'left' ? -10_000 : 10_000);
            flash(side, side === 'left' ? 'back10' : 'fwd10');
            return;
        }
        if (previous) window.clearTimeout(previous.timer);
        const timer = window.setTimeout(() => {
            lastTap.current = null;
            const playing = state.type === 'live' || state.playing;
            engine.toggle();
            flash('center', playing ? 'pause' : 'play');
        }, side === 'center' ? 0 : DOUBLE_TAP_MS);
        lastTap.current = { t: e.timeStamp, timer, side };
    };

    const fullscreen = () => {
        const el = stageRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
        if (document.fullscreenElement) return document.exitFullscreen().catch(() => undefined);
        if (el?.requestFullscreen) return el.requestFullscreen().then(lockLandscape).catch(() => undefined);
        if (el?.webkitRequestFullscreen) return el.webkitRequestFullscreen();
        // iOS Safari: only the video element itself can go fullscreen
        const video = stageRef.current?.querySelector('video.is-visible') as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
        video?.webkitEnterFullscreen?.();
    };

    let overlay: ReactNode = null;
    if (state.type === 'live') {
        if (!camera.online) {
            overlay = <div className="stage-card">
                <Icon name="offline" size={26} />
                <strong>Camera offline</strong>
                <span>Live video is not available while this camera is offline.</span>
            </div>;
        } else if (state.status === 'error') {
            overlay = <div className="stage-card">
                <Icon name="alert" size={26} />
                <strong>Live stream unavailable</strong>
                <span>Retrying…</span>
            </div>;
        } else if (state.status !== 'playing') {
            overlay = SPINNER;
        }
    } else if (state.status === 'loading' || state.status === 'buffering') {
        overlay = SPINNER;
    } else if (state.status === 'error') {
        overlay = <div className="stage-card">
            <Icon name="alert" size={26} />
            <strong>Couldn't play this recording</strong>
            <button className="btn btn-small" onClick={() => engine.seek(state.time, true)}>Try again</button>
        </div>;
    }

    return <div className="stage" ref={stageRef} onPointerUp={onTap} data-mode={state.type} data-status={state.status}>
        <video ref={liveRef} aria-label="Live video" className="stage-video" muted playsInline autoPlay disablePictureInPicture />
        <video ref={aRef} aria-label="Recording slot A" className="stage-video" muted playsInline disablePictureInPicture />
        <video ref={bRef} aria-label="Recording slot B" className="stage-video" muted playsInline disablePictureInPicture />

        {overlay && <div className={`stage-overlay${overlay === SPINNER ? ' is-busy' : ''}`}>{overlay}</div>}

        {ripple && <div key={ripple.id} className={`stage-ripple is-${ripple.side}`} onAnimationEnd={() => setRipple(null)}>
            <Icon name={ripple.icon} size={30} />
        </div>}

        {state.notice && <div key={state.notice.id} className="stage-notice" role="status">{state.notice.text}</div>}

        <button className="stage-fullscreen btn-icon" onClick={fullscreen} aria-label="Fullscreen" title="Fullscreen (F)">
            <Icon name="fullscreen" size={20} />
        </button>
        {children}
    </div>;
}

type LockableOrientation = ScreenOrientation & { lock?: (o: string) => Promise<void> };

/** Android Chrome can lock orientation while fullscreen; iOS and desktop can't, which is fine. */
function lockLandscape() {
    const orientation = screen.orientation as LockableOrientation | undefined;
    orientation?.lock?.('landscape').catch(() => undefined);
}
