import { CSSProperties } from 'react'

const styles = {
    badge: {
        top: '20px',
        left: '20px',
        zIndex: 10,
        fontWeight: 'bold',
        fontSize: '14px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
    } as CSSProperties,

    indicator: (isPlaying: boolean) => ({
        width: '8px',
        height: '8px',
        animation: isPlaying ? 'pulse 2s infinite' : 'none'
    } as CSSProperties)
};

export type LiveBadgeProps = {
    isPlaying: boolean
}

export function LiveBadge({isPlaying}: LiveBadgeProps) {
    return (
        <>
            <div className='position-absolute bg-danger text-white px-3 py-1 rounded' style={styles.badge}>
                <span className='d-inline-block rounded-circle bg-white' style={styles.indicator(isPlaying)} />
                LIVE
            </div>

            <style>{`
                @keyframes pulse {
                    0%, 100% {
                        opacity: 1;
                    }
                    50% {
                        opacity: 0.3;
                    }
                }
            `}</style>
        </>
    );
}
