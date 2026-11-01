import { useState } from 'react';
import { Icon } from './common/Icon';

type OfflineProps = {
    onRetry: () => Promise<void>
}

/** Full-screen state when the server can't be reached (no network, VPN down). */
export function Offline({ onRetry }: OfflineProps) {
    const [checking, setChecking] = useState(false);
    const online = navigator.onLine;

    const retry = async () => {
        setChecking(true);
        await onRetry();
        setChecking(false);
    };

    return <main className="fullscreen-state">
        <span className="state-icon"><Icon name="offline" size={30} /></span>
        <h1>{online ? "Can't reach Tapes" : "You're offline"}</h1>
        <p>{online
            ? 'The server is not answering. If you are away from home, connect to the VPN.'
            : 'Connect to a network, then to the VPN if you are away from home.'}</p>
        <button className="btn btn-primary" onClick={retry} disabled={checking}>
            <Icon name="refresh" size={18} className={checking ? 'spin' : undefined} />
            {checking ? 'Checking…' : 'Try again'}
        </button>
    </main>;
}
