import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { usePoll } from '@app/hooks/usePoll';
import { getCamera } from '@app/services/cameras';
import { Camera } from '@app/types';
import { usePlayer } from './usePlayer';
import { startTime } from './startTime';
import './plain-player.css';

export default function CameraView() {
    const { name = '' } = useParams();
    const [query] = useSearchParams();
    const start = startTime(query.get('t'));
    const camera = usePoll(signal => getCamera(name, signal), [name]);

    return <main>
        <Link to="/">Back to cameras</Link>
        <h1>{name}</h1>
        {camera.type === 'loading' ? <p role="status">Loading camera…</p>
            : camera.type === 'error' ? <p role="alert">Could not load camera.</p>
                : <PlainPlayer key={`${name}:${start}`} camera={camera.data} start={start} />}
    </main>;
}

function PlainPlayer({ camera, start }: { camera: Camera, start: number | null }) {
    const { engine, state } = usePlayer(camera, start);
    const stage = useRef<HTMLDivElement>(null);
    const live = useRef<HTMLVideoElement>(null);
    const a = useRef<HTMLVideoElement>(null);
    const b = useRef<HTMLVideoElement>(null);
    const [width, setWidth] = useState(0);
    const aspect = camera.video ? camera.video.width / camera.video.height : 16 / 9;

    useEffect(() => {
        const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
        observer.observe(stage.current!);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        engine.attach(live.current!, a.current!, b.current!);
        return () => engine.detach();
    }, [engine]);

    const busy = ['connecting', 'stalled', 'loading', 'buffering'].includes(state.status);
    return <>
        <div ref={stage} className="plain-player-stage" style={{ height: width / aspect }}>
            <video ref={live} aria-label="Live video" />
            <video ref={a} aria-label="Recording slot A" />
            <video ref={b} aria-label="Recording slot B" />
        </div>
        <p role="status" data-mode={state.type} data-status={state.status}>{state.type}: {state.status}</p>
        {busy && <div className="spinner" aria-label="Buffering" />}
        {state.notice && <p role="status">{state.notice.text}</p>}
    </>;
}
