// Inline stroke icons (24×24 grid, currentColor) so there is no icon font to load.

const paths = {
    camera: <><path d="M15.5 9.5 21 6.5v11l-5.5-3" /><rect x="3" y="6" width="12.5" height="12" rx="2.5" /></>,
    play: <><path d="M7 4.8v14.4a.8.8 0 0 0 1.2.7l11.3-7.2a.8.8 0 0 0 0-1.4L8.2 4.1A.8.8 0 0 0 7 4.8Z" fill="currentColor" stroke="none" /></>,
    pause: <><rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none" /><rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none" /></>,
    back10: <><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" /><path d="M3.5 3.5v4.5H8" /><text x="12.3" y="15.6" fontSize="8.2" fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none">10</text></>,
    fwd10: <><path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" /><path d="M20.5 3.5v4.5H16" /><text x="11.7" y="15.6" fontSize="8.2" fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none">10</text></>,
    rewind: <><path d="M11 18 4 12l7-6v12Z" /><path d="M20 18l-7-6 7-6v12Z" /></>,
    forward: <><path d="M13 18l7-6-7-6v12Z" /><path d="M4 18l7-6-7-6v12Z" /></>,
    left: <><path d="m15 18-6-6 6-6" /></>,
    right: <><path d="m9 18 6-6-6-6" /></>,
    down: <><path d="m6 9 6 6 6-6" /></>,
    arrowLeft: <><path d="M19 12H5" /><path d="m11 18-6-6 6-6" /></>,
    calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
    live: <><circle cx="12" cy="12" r="3" fill="currentColor" /><path d="M7.4 16.6a6.5 6.5 0 0 1 0-9.2M16.6 7.4a6.5 6.5 0 0 1 0 9.2M4.6 19.4a10.4 10.4 0 0 1 0-14.8M19.4 4.6a10.4 10.4 0 0 1 0 14.8" /></>,
    logout: <><path d="M9.5 20.5H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h3.5" /><path d="m16 16.5 4.5-4.5L16 7.5M20.5 12H9.5" /></>,
    eyeOff: <><path d="M10.6 5.1A9.7 9.7 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-2.4 3.3M6.5 6.6C3.9 8.3 2.5 12 2.5 12S6 19 12 19a9.4 9.4 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" /></>,
    offline: <><path d="M2 8.8a15 15 0 0 1 4.2-2.6M9.6 5.3A15 15 0 0 1 22 8.8M5 12.4a10 10 0 0 1 4-2.2M15.2 10.6A10 10 0 0 1 19 12.4M8.5 16a5 5 0 0 1 7 0" /><circle cx="12" cy="19.5" r="1" fill="currentColor" /><path d="M3 3l18 18" /></>,
    fullscreen: <><path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" /></>,
    close: <><path d="M18 6 6 18M6 6l12 12" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    timeline: <><path d="M3 12h18" /><path d="M7 8v8M12 5v14M17 9v6" /></>,
    alert: <><path d="M12 3.5 2.5 20h19L12 3.5Z" /><path d="M12 10v4.5" /><circle cx="12" cy="17.3" r=".6" fill="currentColor" /></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14.6-4.4L4 8" /><path d="M4 3.5V8h4.5" /><path d="M4 13a8 8 0 0 0 14.6 4.4L20 16" /><path d="M20 20.5V16h-4.5" /></>,
    download: <><path d="M12 3.5v11.5M7 10.5l5 5 5-5" /><path d="M4.5 20h15" /></>,
    share: <><path d="M12 3.5v11M8 7.5l4-4 4 4" /><path d="M8.5 11H6.5a1.5 1.5 0 0 0-1.5 1.5v6.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-6.5a1.5 1.5 0 0 0-1.5-1.5h-2" /></>,
    image: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.8" /><path d="m20.5 16-4.8-4.8L6.5 19.5" /></>,
    keyboard: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6.5 10h1M10.5 10h1M14.5 10h1M6.5 14h11" /></>,
    shield: <><path d="M12 2.5 4.5 5.5v6c0 4.6 3.2 8.4 7.5 10 4.3-1.6 7.5-5.4 7.5-10v-6L12 2.5Z" /><circle cx="12" cy="11" r="2.6" /></>,
    check: <><path d="m5 12.5 4.5 4.5L19 7.5" /></>,
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, className }: { name: IconName, size?: number, className?: string }) {
    return <svg
        className={className ? `icon ${className}` : 'icon'}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        {paths[name]}
    </svg>;
}
