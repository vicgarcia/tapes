import { DependencyList, useEffect, useRef, useState } from 'react';
import { isAbort } from '@app/services/base';
import { usePageVisible } from './useVisibility';

export type Loadable<T> =
    | { type: 'loading' }
    | { type: 'ready', data: T }
    | { type: 'error', error: unknown }

/**
 * Load data and keep it fresh: refetches every `interval` ms (when given) while
 * the page is visible, and right away when the page becomes visible again.
 * Keeps showing the last good data while a refresh is in flight or fails.
 */
export function usePoll<T>(
    load: (signal: AbortSignal) => Promise<T>,
    deps: DependencyList,
    interval: number | null = null,
): Loadable<T> {
    const [state, setState] = useState<Loadable<T>>({ type: 'loading' });
    const visible = usePageVisible();
    const loadRef = useRef(load);
    loadRef.current = load;

    // reset when the inputs change
    useEffect(() => {
        setState({ type: 'loading' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    useEffect(() => {
        if (!visible) return;
        const controller = new AbortController();
        let timer: number | undefined;
        const run = async () => {
            try {
                const data = await loadRef.current(controller.signal);
                if (controller.signal.aborted) return;
                setState({ type: 'ready', data });
            } catch (error) {
                if (controller.signal.aborted || isAbort(error)) return;
                setState(previous => previous.type === 'ready' ? previous : { type: 'error', error });
            }
            if (interval !== null && !controller.signal.aborted) timer = window.setTimeout(run, interval);
        };
        run();
        return () => {
            controller.abort();
            window.clearTimeout(timer);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, visible, interval]);

    return state;
}

/** Current time, ticking every `interval` ms. */
export function useNow(interval = 1000): number {
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), interval);
        return () => window.clearInterval(id);
    }, [interval]);
    return now;
}
