import { useCallback, useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'tapes.install-dismissed';

function isStandalone(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches
        || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIOS(): boolean {
    return /iphone|ipad|ipod/i.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function wasDismissed(): boolean {
    try {
        return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
        return false;
    }
}

export type InstallOffer =
    | { type: 'none' }
    | { type: 'prompt', install: () => Promise<void>, dismiss: () => void }   // Chromium: beforeinstallprompt
    | { type: 'ios', dismiss: () => void }                                    // Safari: Share → Add to Home Screen

/** Whether (and how) the app can be installed to the home screen. */
export function useInstallOffer(): InstallOffer {
    const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
    const [dismissed, setDismissed] = useState(wasDismissed);
    const [installed, setInstalled] = useState(isStandalone);

    useEffect(() => {
        const onPrompt = (e: Event) => {
            e.preventDefault();
            setDeferred(e as BeforeInstallPromptEvent);
        };
        const onInstalled = () => {
            setDeferred(null);
            setInstalled(true);
        };
        window.addEventListener('beforeinstallprompt', onPrompt);
        window.addEventListener('appinstalled', onInstalled);
        return () => {
            window.removeEventListener('beforeinstallprompt', onPrompt);
            window.removeEventListener('appinstalled', onInstalled);
        };
    }, []);

    const dismiss = useCallback(() => {
        setDismissed(true);
        try {
            localStorage.setItem(DISMISS_KEY, '1');
        } catch {
            // private mode: dismissal lasts for this visit only
        }
    }, []);

    const install = useCallback(async () => {
        if (!deferred) return;
        try {
            await deferred.prompt();
            const { outcome } = await deferred.userChoice;
            if (outcome === 'dismissed') dismiss();
        } catch (error) {
            console.error('installation prompt failed', error);
        } finally {
            setDeferred(null);
        }
    }, [deferred, dismiss]);

    if (installed || dismissed) return { type: 'none' };
    if (deferred) return { type: 'prompt', install, dismiss };
    if (isIOS()) return { type: 'ios', dismiss };
    return { type: 'none' };
}

const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000;

/** Service worker registration; `needRefresh` when a new version is waiting. */
export function useAppUpdate() {
    const [registration, setRegistration] = useState<ServiceWorkerRegistration | undefined>();
    const {
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegisteredSW(_url, registration) {
            setRegistration(registration);
        },
        onRegisterError(error) {
            console.error('service worker registration failed', error);
        },
    });

    useEffect(() => {
        if (!registration) return;
        // Installed PWAs can stay open for days; check without interrupting video.
        const timer = window.setInterval(() => {
            if (navigator.onLine) registration.update().catch(() => undefined);
        }, UPDATE_CHECK_INTERVAL);
        return () => window.clearInterval(timer);
    }, [registration]);

    return {
        needRefresh,
        update: () => updateServiceWorker(true),
        dismiss: () => setNeedRefresh(false),
    };
}
