import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { addDays, DAY, dayOfMonth, formatLongDate, formatWeekdayShort, startOfDay } from '@app/lib/time';

// Horizontal strip of day tiles, newest first: weekday + date going back,
// loading more days as it scrolls. Tiles are sized so a whole number of them
// fits the strip and scrolling snaps a tile at a time, so none is ever cut off.

type DayChipsProps = {
    selected: number                       // local midnight
    onSelect: (day: number) => void
    label?: string
}

const PAGE = 21;

export function DayChips({ selected, onSelect, label = 'Day' }: DayChipsProps) {
    const today = startOfDay(Date.now());
    const [count, setCount] = useState(PAGE);
    const strip = useRef<HTMLDivElement>(null);
    const sentinel = useRef<HTMLSpanElement>(null);

    // always include the selected day, plus a page beyond it
    const back = Math.round((today - selected) / DAY);
    const total = Math.max(count, back + PAGE);
    const list = useMemo(() => Array.from({ length: total }, (_, i) => addDays(today, -i)), [today, total]);

    // load another page as the end of the strip comes into view
    useEffect(() => {
        const root = strip.current, end = sentinel.current;
        if (!root || !end) return;
        const observer = new IntersectionObserver(entries => {
            if (entries.some(e => e.isIntersecting)) setCount(c => Math.max(c, total) + PAGE);
        }, { root, rootMargin: '0px 400px 0px 0px' });
        observer.observe(end);
        return () => observer.disconnect();
    }, [total]);

    // keep the selected chip in view
    useLayoutEffect(() => {
        const el = strip.current?.querySelector('.is-active') as HTMLElement | null;
        el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, [selected]);

    return <div className="day-chips" ref={strip} role="group" aria-label={label}>
        {list.map(day => {
            return <button
                key={day}
                className={`day-chip${selected === day ? ' is-active' : ''}`}
                onClick={() => onSelect(day)}
                aria-pressed={selected === day}
                aria-label={formatLongDate(day)}
            >
                <span className="day-chip-top">{formatWeekdayShort(day)}</span>
                <span className="day-chip-main">{dayOfMonth(day)}</span>
            </button>;
        })}
        <span ref={sentinel} className="day-chips-end" aria-hidden="true" />
    </div>;
}
