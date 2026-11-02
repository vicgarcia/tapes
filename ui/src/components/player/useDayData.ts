import { useEffect, useMemo, useRef, useState } from 'react';
import { Span } from '@app/types';
import { getSpansForDay } from '@app/services/recordings';
import { isAbort } from '@app/services/base';
import { addDays, isToday, SECOND } from '@app/lib/time';
import { usePageVisible } from '@app/hooks/useVisibility';

const TODAY_REFRESH_MS = 30 * SECOND;

type DayEntry = {
    spans: Span[]
    fetchedAt: number
}

export type DayData = {
    spans: Span[]
    /** days (local midnights) whose data has arrived */
    loaded: Set<number>
}

/**
 * Spans for a set of local days, cached per day. Today's data is
 * refetched every 30s, and today's last span is stretched to `now` between
 * fetches so the recorded bar keeps growing.
 */
export function useDayData(camera: string, days: number[], now: number): DayData {
    const cache = useRef(new Map<string, DayEntry>());
    const [version, setVersion] = useState(0);
    const visible = usePageVisible();
    const key = days.join(',');

    useEffect(() => {
        if (!visible) return;
        const controller = new AbortController();
        let timer: number | undefined;

        const refresh = async () => {
            const due = days.filter(day => {
                const entry = cache.current.get(`${camera}|${day}`);
                if (!entry) return true;
                return isToday(day) && Date.now() - entry.fetchedAt >= TODAY_REFRESH_MS - 500;
            });
            await Promise.all(due.map(async day => {
                try {
                    const spans = await getSpansForDay(camera, day, controller.signal);
                    if (controller.signal.aborted) return;
                    cache.current.set(`${camera}|${day}`, { spans, fetchedAt: Date.now() });
                } catch (error) {
                    if (!isAbort(error)) console.warn('timeline data', error);
                }
            }));
            if (controller.signal.aborted) return;
            if (due.length) setVersion(v => v + 1);
            if (days.some(isToday)) timer = window.setTimeout(refresh, TODAY_REFRESH_MS);
        };
        refresh();
        return () => {
            controller.abort();
            window.clearTimeout(timer);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [camera, key, visible]);

    const merged = useMemo(() => {
        const spans: Span[] = [];
        const loaded = new Set<number>();
        for (const day of [...days].sort((a, b) => a - b)) {
            const entry = cache.current.get(`${camera}|${day}`);
            if (!entry) continue;
            loaded.add(day);
            entry.spans.forEach((span, i) => {
                let end = span.end;
                // still recording: the last span of today ends at "now"
                const last = i === entry.spans.length - 1;
                if (last && isToday(day) && span.end >= entry.fetchedAt - 15 * SECOND) {
                    end = Math.max(span.end, Math.min(now - SECOND, addDays(day, 1)));
                }
                const previous = spans[spans.length - 1];
                // a span crossing midnight comes back as two; join them
                if (previous && span.start - previous.end < 50) previous.end = Math.max(previous.end, end);
                else spans.push({ ...span, end });
            });
        }
        return {
            spans,
            loaded,
        };
    // `now` only matters for the growing span; coarse is fine
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [camera, key, version, Math.floor(now / SECOND)]);

    return merged;
}
