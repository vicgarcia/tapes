import { Camera } from '@app/types';

/** Online/offline pill. */
export function CameraStatus({ camera }: { camera: Camera }) {
    return <span className="camera-status">
        <span className={`status-pill ${camera.online ? 'is-online' : 'is-offline'}`}>
            <span className="status-dot" />{camera.online ? 'Online' : 'Offline'}
        </span>
    </span>;
}
