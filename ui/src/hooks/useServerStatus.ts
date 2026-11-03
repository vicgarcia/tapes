import { useState, useEffect, useCallback } from 'react';
import { setTimeZone } from '@app/lib/time';

const POLL_INTERVAL = 15_000;        // check every 15s
const HEALTH_CHECK_TIMEOUT = 2_000;  // 2s — fail fast

export function useServerStatus() {
  const [isServerReachable, setIsServerReachable] = useState<boolean | null>(null);

  const check = useCallback(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);
    try {
      const response = await fetch('/health', { cache: 'no-store', signal: controller.signal });
      // The app time zone is set before anything renders dates; an older server reports none.
      if (response.ok) {
        const health: { timezone?: string } = await response.json().catch(() => ({}));
        setTimeZone(health.timezone);
      }
      setIsServerReachable(response.ok);
    } catch {
      setIsServerReachable(false);
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    check();

    const interval = setInterval(check, POLL_INTERVAL);

    // Browser says we're offline — believe it immediately, no round-trip needed
    const handleOffline = () => setIsServerReachable(false);

    // Browser says we're back — verify immediately
    const handleOnline = () => check();

    // API call failed (dispatched from the fetch wrapper) — go offline immediately
    const handleServerUnreachable = () => setIsServerReachable(false);

    // User switched back to this tab — recheck in case things changed
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') check();
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    window.addEventListener('server-unreachable', handleServerUnreachable);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('server-unreachable', handleServerUnreachable);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [check]);

  return { isServerReachable, retry: check };
}
