import { memo, useLayoutEffect, useRef, useState } from 'react';
import { Span } from '@app/types';
import { addDays, atHour, formatHour } from '@app/lib/time';

// Whole-day overview above the zoomed timeline: the day's recordings
// at a glance, the playhead, and a bracket for the zoomed range.
// Tap or drag anywhere on it to jump.

type DayStripProps = {
    day: number             // local midnight
    time: number            // playhead
    viewStart: number
    viewEnd: number
    now: number
    spans: Span[]
    onScrub: (time: number | null) => void
    onSeek: (time: number) => void
}

export const DayStrip = memo(function DayStrip(props: DayStripProps) {
    const { day, time, viewStart, viewEnd, now, spans } = props;
    const ref = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    const dragging = useRef<number | null>(null);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new ResizeObserver(() => setWidth(el.clientWidth));
        observer.observe(el);
        setWidth(el.clientWidth);
        return () => observer.disconnect();
    }, []);

    const dayEnd = addDays(day, 1);
    const length = dayEnd - day;
    const x = (t: number) => Math.max(0, Math.min(width, (t - day) / length * width));
    const timeAt = (clientX: number) => {
        const rect = ref.current!.getBoundingClientRect();
        const t = day + (clientX - rect.left) / rect.width * length;
        return Math.max(day, Math.min(t, dayEnd - 1, now));
    };

    const down = (e: React.PointerEvent) => {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        dragging.current = e.pointerId;
        props.onScrub(timeAt(e.clientX));
    };
    const move = (e: React.PointerEvent) => {
        if (dragging.current === e.pointerId) props.onScrub(timeAt(e.clientX));
    };
    const up = (e: React.PointerEvent) => {
        if (dragging.current !== e.pointerId) return;
        dragging.current = null;
        props.onScrub(null);
        props.onSeek(timeAt(e.clientX));
    };

    const H = 24, BAR_Y = 3, BAR_H = 10;
    const recordedTo = Math.min(now, dayEnd);
    const hours = [6, 12, 18].map(h => atHour(day, h));

    return <div ref={ref} className="daystrip" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { dragging.current = null; props.onScrub(null); }}
        aria-label="Day overview" role="slider" aria-valuenow={Math.round(time / 1000)}>
        {width > 0 && <svg width={width} height={H}>
            {recordedTo > day && <rect x={0} y={BAR_Y} width={x(recordedTo)} height={BAR_H} className="ds-gap" rx={2} />}
            {spans.filter(s => s.end > day && s.start < dayEnd).map(s =>
                <rect key={s.start} x={x(s.start)} y={BAR_Y} width={Math.max(1, x(s.end) - x(s.start))} height={BAR_H} className="ds-span" />)}
            {hours.map(h => <g key={h}>
                <line x1={x(h)} x2={x(h)} y1={BAR_Y + BAR_H} y2={BAR_Y + BAR_H + 3} className="ds-tick" />
                <text x={x(h)} y={H - 2} className="ds-label" textAnchor="middle">{formatHour(h)}</text>
            </g>)}
            {viewEnd - viewStart < length * 0.98 &&
                <rect x={x(viewStart)} y={BAR_Y - 2.5} width={Math.max(3, x(viewEnd) - x(viewStart))} height={BAR_H + 5} className="ds-window" rx={2.5} />}
            {time >= day && time < dayEnd && <line x1={x(time)} x2={x(time)} y1={0} y2={BAR_Y + BAR_H + 3} className="ds-playhead" />}
        </svg>}
    </div>;
});
