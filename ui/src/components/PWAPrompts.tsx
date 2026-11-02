import { useAppUpdate, useInstallOffer } from '@app/hooks/usePWA';
import { Icon } from './common/Icon';

/** "New version" toast. Shown app-wide; reloading is the user's call. */
export function UpdatePrompt() {
    const { needRefresh, update, dismiss } = useAppUpdate();
    if (!needRefresh) return null;
    return <div className="toast toast-update" role="status">
        <Icon name="refresh" size={18} />
        <span className="toast-text">A new version of Tapes is ready</span>
        <button className="btn btn-small btn-primary" onClick={update}>Reload</button>
        <button className="btn-icon btn-small" onClick={dismiss} aria-label="Later"><Icon name="close" size={16} /></button>
    </div>;
}

/** Add-to-home-screen banner for the cameras page. */
export function InstallPrompt() {
    const offer = useInstallOffer();
    if (offer.type === 'none') return null;
    return <div className="install-banner">
        <span className="install-icon"><Icon name="download" size={18} /></span>
        <div className="install-text">
            <strong>Install Tapes</strong>
            {offer.type === 'ios'
                ? <span>Tap <Icon name="share" size={14} /> Share, then “Add to Home Screen”</span>
                : <span>Full-screen app with its own icon</span>}
        </div>
        {offer.type === 'prompt' && <button className="btn btn-small btn-primary" onClick={offer.install}>Install</button>}
        <button className="btn-icon btn-small" onClick={offer.dismiss} aria-label="Dismiss"><Icon name="close" size={16} /></button>
    </div>;
}
