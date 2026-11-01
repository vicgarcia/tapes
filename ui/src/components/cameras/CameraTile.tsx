import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Camera } from '@app/types';
import { useSnapshot } from '@app/hooks/useSnapshot';
import { formatAgo, SECOND } from '@app/lib/time';
import { useInView, usePageVisible } from '@app/hooks/useVisibility';
import { Icon } from '@app/components/common/Icon';
import { CameraStatus } from './CameraStatus';

const STALE_MS = 60 * SECOND;

export function CameraTile({ camera }: { camera: Camera }) {
    const ref = useRef<HTMLAnchorElement>(null);
    const inView = useInView(ref);
    const pageVisible = usePageVisible();
    const snapshot = useSnapshot(camera, inView && pageVisible);
    const aspect = camera.video ? `${camera.video.width} / ${camera.video.height}` : '16 / 9';

    const stale = snapshot.type === 'ready' && snapshot.snapshot.time !== null && Date.now() - snapshot.snapshot.time > STALE_MS
        ? snapshot.snapshot.time : null;

    return <Link ref={ref} to={`/cameras/${encodeURIComponent(camera.name)}`} className={`camera-tile${camera.online ? '' : ' is-offline'}`}>
        <div className="camera-tile-image" style={{ aspectRatio: aspect }}>
            {snapshot.type === 'ready' && <img src={snapshot.snapshot.url} alt={`${camera.name} snapshot`} />}
            {snapshot.type === 'none' && <div className="camera-tile-empty">
                <Icon name={camera.online ? 'image' : 'offline'} size={28} />
                <span>{camera.online ? 'No snapshot' : 'Camera offline'}</span>
            </div>}
            {snapshot.type === 'loading' && <div className="camera-tile-empty"><div className="spinner spinner-small" /></div>}
            {camera.online && <span className="badge badge-live camera-tile-live"><span className="live-dot" />Live</span>}
            {stale !== null && <span className="badge camera-tile-age">Image from {formatAgo(stale)}</span>}
        </div>
        <div className="camera-tile-info">
            <h2>{camera.name}</h2>
            <CameraStatus camera={camera} />
        </div>
    </Link>;
}
