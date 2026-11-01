import { getCameras } from '@app/services/cameras';
import { SECOND } from '@app/lib/time';
import { usePoll } from '@app/hooks/usePoll';
import { Icon } from '@app/components/common/Icon';
import { CameraTile } from './CameraTile';

/** Home: a tile per camera. */
export function CamerasHome() {
    const cameras = usePoll(signal => getCameras(signal), [], 15 * SECOND);
    const list = cameras.type === 'ready' ? cameras.data : [];

    return <main className="page">
        {cameras.type === 'loading' && <div className="camera-grid">
            <div className="camera-tile is-skeleton" /><div className="camera-tile is-skeleton" />
        </div>}
        {cameras.type === 'error' && <div className="empty-state">
            <Icon name="alert" size={26} />
            <strong>Couldn't load cameras</strong>
        </div>}
        {cameras.type === 'ready' && list.length === 0 && <div className="empty-state">
            <Icon name="camera" size={26} />
            <strong>No cameras yet</strong>
            <span>Add cameras as paths in mediamtx.yml.</span>
        </div>}
        <div className="camera-grid">
            {list.map(camera => <CameraTile key={camera.name} camera={camera} />)}
        </div>
    </main>;
}
