import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Span } from '@app/types';
import { clampZoom } from './zoom';
import { addDays, formatClock, formatHour, formatTime, formatWeekday, HOUR, MINUTE, SECOND, startOfDay } from '@app/lib/time';

// Scrubbable timeline with the playhead fixed in the middle: dragging moves the
// day underneath it (like a tape), tapping jumps to a moment, pinch / wheel
// zooms. Recorded spans are solid, gaps hatched, the future left empty.


const STEPS = [5 * SECOND, 10 * SECOND, 15 * SECOND, 30 * SECOND, MINUTE, 2 * MINUTE, 5 * MINUTE, 10 * MINUTE,
    15 * MINUTE, 30 * MINUTE, HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR];
const LABEL_MIN_PX = 72;
const MINOR_MIN_PX = 9;
const TAP_SLOP_PX = 6;


type TimelineProps = {
    center: number                       // time under the playhead
    zoom: number                         // visible duration, ms
    now: number
    spans: Span[]
    live: boolean
    onScrub: (time: number | null) => void   // while dragging (null = done)
    onSeek: (time: number) => void
    onZoom: (span: number) => void
}

type Gesture =
    | { type: 'none' }
    | { type: 'press', id: number, x: number, center: number, moved: boolean, samples: { x: number, t: number }[] }
    | { type: 'pinch', distance: number, zoom: number, center: number }

function pickSteps(pxPerMs: number): [number, number] {
    const major = STEPS.find(step => step * pxPerMs >= LABEL_MIN_PX) ?? 12 * HOUR;
    const minor = STEPS.find(step => step < major && major % step === 0 && step * pxPerMs >= MINOR_MIN_PX) ?? major;
    return [major, minor];
}

function tickLabel(t: number, step: number): string {
    if (t === startOfDay(t)) return formatWeekday(t);
    if (step < MINUTE) return formatClock(t);
    if (step >= HOUR) return formatHour(t);
    return formatTime(t);
}

export const Timeline = memo(function Timeline(props: TimelineProps) {
    const { center, zoom, now, spans, live } = props;
    const wrapRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    const gesture = useRef<Gesture>({ type: 'none' });
    const pointers = useRef(new Map<number, number>());
    const fling = useRef(0);
    const wheelTimer = useRef<number | undefined>(undefined);
    const wheelCenter = useRef<number | null>(null);

    // latest props for the (stable) native listeners
    const latest = useRef(props);
    latest.current = props;

    useLayoutEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const observer = new ResizeObserver(() => setWidth(el.clientWidth));
        observer.observe(el);
        setWidth(el.clientWidth);
        return () => observer.disconnect();
    }, []);

    const msPerPx = width > 0 ? zoom / width : 1;
    const viewStart = center - zoom / 2;
    const viewEnd = center + zoom / 2;
    const x = (t: number) => (t - viewStart) / msPerPx;

    const clampTime = (t: number) => Math.min(t, latest.current.now);

    // ---- pointer gestures -------------------------------------------------

    const commit = useCallback((t: number) => {
        latest.current.onScrub(null);
        latest.current.onSeek(clampTime(t));
    }, []);

    const onPointerDown = (e: React.PointerEvent) => {
        cancelAnimationFrame(fling.current);
        window.clearTimeout(wheelTimer.current);
        wheelCenter.current = null;
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, e.clientX);
        if (pointers.current.size === 1) {
            gesture.current = { type: 'press', id: e.pointerId, x: e.clientX, center, moved: false, samples: [{ x: e.clientX, t: e.timeStamp }] };
        } else if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            const g = gesture.current;
            const current = g.type === 'press' ? g.center - (pointers.current.get(g.id)! - g.x) * msPerPx : center;
            gesture.current = { type: 'pinch', distance: Math.max(20, Math.abs(a - b)), zoom, center: current };
            props.onScrub(clampTime(current));
        }
    };

    const onPointerMove = (e: React.PointerEvent) => {
        if (!pointers.current.has(e.pointerId)) return;
        pointers.current.set(e.pointerId, e.clientX);
        const g = gesture.current;
        if (g.type === 'pinch' && pointers.current.size >= 2) {
            const [a, b] = [...pointers.current.values()];
            props.onZoom(clampZoom(g.zoom * g.distance / Math.max(20, Math.abs(a - b))));
            return;
        }
        if (g.type === 'press' && e.pointerId === g.id) {
            const dx = e.clientX - g.x;
            if (!g.moved && Math.abs(dx) < TAP_SLOP_PX) return;
            g.moved = true;
            g.samples.push({ x: e.clientX, t: e.timeStamp });
            if (g.samples.length > 6) g.samples.shift();
            props.onScrub(clampTime(g.center - dx * msPerPx));
        }
    };

    const onPointerUp = (e: React.PointerEvent) => {
        if (!pointers.current.has(e.pointerId)) return;
        pointers.current.delete(e.pointerId);
        const g = gesture.current;

        if (g.type === 'pinch') {
            // one finger left: carry on as a drag from where the view is now
            const rest = [...pointers.current.entries()][0];
            if (rest) gesture.current = { type: 'press', id: rest[0], x: rest[1], center: g.center, moved: true, samples: [] };
            else {
                gesture.current = { type: 'none' };
                props.onScrub(null);
            }
            return;
        }
        if (g.type !== 'press' || e.pointerId !== g.id) return;
        gesture.current = { type: 'none' };

        if (!g.moved) {
            const rect = wrapRef.current!.getBoundingClientRect();
            commit(viewStart + (e.clientX - rect.left) * msPerPx);
            return;
        }

        const released = g.center - (e.clientX - g.x) * msPerPx;
        // flick: keep gliding and settle
        const s = g.samples;
        const first = s[0], last = s[s.length - 1];
        const velocity = s.length >= 2 && last.t - first.t > 0 && e.timeStamp - last.t < 80 ? (last.x - first.x) / (last.t - first.t) : 0;
        if (Math.abs(velocity) < 0.35) return commit(released);
        let v = velocity;              // px per ms
        let t = released;
        let previous = performance.now();
        const step = (stamp: number) => {
            const dt = Math.min(32, stamp - previous);
            previous = stamp;
            t = clampTime(t - v * dt * msPerPx);
            v *= Math.pow(0.994, dt);
            latest.current.onScrub(t);
            if (Math.abs(v) > 0.03 && t < latest.current.now) fling.current = requestAnimationFrame(step);
            else commit(t);
        };
        fling.current = requestAnimationFrame(step);
    };

    // ---- wheel: zoom (vertical / pinch-to-zoom trackpads), pan (horizontal) --

    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const p = latest.current;
            if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                p.onZoom(clampZoom(p.zoom * Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))));
                return;
            }
            const per = p.zoom / el.clientWidth;
            wheelCenter.current = Math.min(p.now, (wheelCenter.current ?? p.center) + e.deltaX * per);
            p.onScrub(wheelCenter.current);
            window.clearTimeout(wheelTimer.current);
            wheelTimer.current = window.setTimeout(() => {
                const t = wheelCenter.current;
                wheelCenter.current = null;
                if (t !== null) commit(t);
            }, 350);
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => {
            el.removeEventListener('wheel', onWheel);
            window.clearTimeout(wheelTimer.current);
        };
    }, [commit]);

    useEffect(() => () => cancelAnimationFrame(fling.current), []);

    // ---- drawing ------------------------------------------------------------

    const H = 56;
    const LABEL_Y = 11, TICK_Y = 16, BAR_Y = 26, BAR_H = 24;
    const [major, minor] = pickSteps(1 / msPerPx);
    const base = startOfDay(viewStart);
    const ticks: { t: number, major: boolean }[] = [];
    if (width > 0) {
        for (let t = base + Math.floor((viewStart - base) / minor) * minor; t <= viewEnd; t += minor) {
            if (t < viewStart) continue;
            ticks.push({ t, major: (t - base) % major === 0 });
        }
    }
    const midnights: number[] = [];
    for (let m = addDays(viewStart, 1); m < viewEnd; m = addDays(m, 1)) midnights.push(m);

    const recordedEnd = Math.min(viewEnd, now);
    const visibleSpans = spans.filter(s => s.end > viewStart && s.start < viewEnd);
    const clampX = (v: number) => Math.max(-2, Math.min(width + 2, v));

    return <div
        ref={wrapRef}
        className={`timeline${live ? ' is-live' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
            pointers.current.clear();
            gesture.current = { type: 'none' };
            props.onScrub(null);
        }}
        role="slider"
        aria-label="Timeline"
        aria-valuetext={formatClock(center)}
        aria-valuenow={Math.round(center / 1000)}
    >
        {width > 0 && <svg width={width} height={H} className="timeline-svg">
            <defs>
                <pattern id="gap-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="6" height="6" fill="var(--gap-bg)" />
                    <line x1="0" y1="0" x2="0" y2="6" stroke="var(--gap-line)" strokeWidth="2" />
                </pattern>
            </defs>

            {/* gaps: everything up to now that is not covered by a span */}
            {recordedEnd > viewStart && <rect x={clampX(x(viewStart))} y={BAR_Y} width={Math.max(0, clampX(x(recordedEnd)) - clampX(x(viewStart)))} height={BAR_H} fill="url(#gap-hatch)" rx={3} />}
            {/* the future */}
            {now < viewEnd && <rect x={clampX(x(now))} y={BAR_Y} width={Math.max(0, width - clampX(x(now)))} height={BAR_H} className="tl-future" rx={3} />}

            {visibleSpans.map(s => {
                const a = clampX(x(s.start)), b = clampX(x(s.end));
                return <rect key={s.start} x={a} y={BAR_Y} width={Math.max(1, b - a)} height={BAR_H} className="tl-span" rx={2} />;
            })}

            {ticks.map(({ t, major: isMajor }) => <line key={t} x1={x(t)} x2={x(t)} y1={isMajor ? TICK_Y - 3 : TICK_Y} y2={TICK_Y + 4} className={isMajor ? 'tl-tick-major' : 'tl-tick'} />)}
            {ticks.filter(t => t.major && t.t !== startOfDay(t.t)).map(({ t }) => <text key={t} x={x(t)} y={LABEL_Y} className="tl-label" textAnchor="middle">{tickLabel(t, major)}</text>)}

            {midnights.map(m => <g key={m}>
                <line x1={x(m)} x2={x(m)} y1={4} y2={H} className="tl-midnight" />
                <text x={x(m) + 5} y={LABEL_Y} className="tl-label tl-label-day">{formatWeekday(m)}</text>
            </g>)}

            {now > viewStart && now < viewEnd && <g className="tl-now">
                <line x1={x(now)} x2={x(now)} y1={BAR_Y - 4} y2={BAR_Y + BAR_H + 4} />
            </g>}
        </svg>}
        <div className="timeline-playhead" aria-hidden="true"><span /></div>
    </div>;
});
