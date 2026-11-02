import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Camera } from '@app/types';
import { useSnapshot } from '@app/hooks/useSnapshot';
import { useInView, usePageVisible } from '@app/hooks/useVisibility';
import { SECOND } from '@app/lib/time';
import { Icon } from '@app/components/common/Icon';

// Compact camera tiles for switching cameras inside the player. Switching
// keeps the moment: live stays live, playback opens the other camera at the
// same wall-clock time.

type CameraStripProps = {
    cameras: Camera[]
    current: string
    at: number | null          // playback time to carry over, null when live
}

export function CameraStrip({ cameras, current, at }: CameraStripProps) {
    if (cameras.length < 2) return null;
    return <div className="camera-strip" role="group" aria-label="Cameras">
        {cameras.map(camera => <MiniTile key={camera.name} camera={camera} active={camera.name === current} at={at} />)}
    </div>;
}

function MiniTile({ camera, active, at }: { camera: Camera, active: boolean, at: number | null }) {
    const ref = useRef<HTMLAnchorElement>(null);
    const inView = useInView(ref);
    const visible = usePageVisible();
    const snapshot = useSnapshot(camera, inView && visible && !active, 10 * SECOND);
    const to = `/cameras/${encodeURIComponent(camera.name)}${at !== null ? `?t=${Math.round(at)}` : ''}`;

    return <Link ref={ref} to={to} replace className={`mini-tile${active ? ' is-active' : ''}${camera.online ? '' : ' is-offline'}`}
        aria-current={active ? 'page' : undefined}>
        <span className="mini-tile-image">
            {snapshot.type === 'ready' && !active && <img src={snapshot.snapshot.url} alt="" />}
            {active && <span className="mini-tile-watching"><Icon name="play" size={14} />Watching</span>}
            {!active && snapshot.type !== 'ready' && <Icon name={camera.online ? 'camera' : 'offline'} size={18} />}
        </span>
        <span className="mini-tile-name"><span className={`status-dot ${camera.online ? 'is-online' : 'is-offline'}`} />{camera.name}</span>
    </Link>;
}
