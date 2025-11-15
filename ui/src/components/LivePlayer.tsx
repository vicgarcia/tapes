import { useState, useEffect, CSSProperties } from 'react'
import ReactPlayer from 'react-player'
import { Camera } from '@app/types';
import { LiveBadge } from './LiveBadge';

const styles = {
    container: {
        width: '100%',
        maxWidth: '1280px',
        aspectRatio: '16 / 9',
        backgroundColor: '#000'
    } as CSSProperties,

    errorOverlay: {
        zIndex: 5,
        top: 0,
        left: 0
    } as CSSProperties,

    player: {
        position: 'absolute',
        top: 0,
        left: 0
    } as CSSProperties
};

export type LivePlayerProps = {
    camera: Camera
}

export function LivePlayer({camera}: LivePlayerProps) {
    const [isPlaying, setIsPlaying] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [retryCount, setRetryCount] = useState(0);

    const streamUrl = `/cameras/${camera.name}/live/index.m3u8`;

    const handleError = (error: unknown) => {
        console.error('Live stream error:', error);
        setHasError(true);

        // auto-retry up to 3 times
        if (retryCount < 3) {
            console.log(`Retrying stream (attempt ${retryCount + 1})...`);
            setTimeout(() => {
                setHasError(false);
                setRetryCount(retryCount + 1);
            }, 2000);
        }
    };

    const handleReady = () => {
        console.log('Live stream ready:', streamUrl);
        setHasError(false);
        setRetryCount(0);
    };

    const handleManualRetry = () => {
        setHasError(false);
        setRetryCount(0);
    };

    useEffect(() => {
        setHasError(false);
        setRetryCount(0);
    }, [camera]);

    return <div className='live-player position-relative mb-5' style={styles.container}>
        <LiveBadge isPlaying={isPlaying} />

        {hasError && (
            <div className='position-absolute w-100 h-100 d-flex align-items-center justify-content-center bg-dark text-white' style={styles.errorOverlay}>
                <div className='text-center p-4'>
                    <h4>Stream Unavailable</h4>
                    <p>The camera may be offline or the stream is not ready.</p>
                    <button className='btn btn-outline-light' onClick={handleManualRetry}>
                        Retry
                    </button>
                </div>
            </div>
        )}

        <ReactPlayer
            key={`live-${camera.name}-${retryCount}`}
            width='100%'
            height='100%'
            url={streamUrl}
            playing={isPlaying}
            controls={true}
            muted={false}
            onError={handleError}
            onReady={handleReady}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            style={styles.player}
            config={{
                file: {
                    attributes: {
                        crossOrigin: 'same-origin'
                    },
                    hlsOptions: {
                        enableWorker: true,
                        lowLatencyMode: false,
                        // Increase buffers to handle packet loss
                        backBufferLength: 120,
                        maxBufferLength: 60,
                        maxMaxBufferLength: 120,
                        maxBufferSize: 120 * 1000 * 1000,
                        maxBufferHole: 1.0,
                        // More tolerant sync settings
                        liveSyncDuration: 5,
                        liveMaxLatencyDuration: 20,
                        liveDurationInfinity: true,
                        // Aggressive retry settings for packet loss
                        manifestLoadingTimeOut: 15000,
                        manifestLoadingMaxRetry: 5,
                        manifestLoadingRetryDelay: 500,
                        levelLoadingTimeOut: 15000,
                        levelLoadingMaxRetry: 6,
                        levelLoadingRetryDelay: 500,
                        fragLoadingTimeOut: 30000,
                        fragLoadingMaxRetry: 10,
                        fragLoadingRetryDelay: 500,
                        // Additional stability settings
                        startLevel: -1,
                        abrEwmaDefaultEstimate: 500000,
                        abrBandWidthFactor: 0.8,
                        abrBandWidthUpFactor: 0.5
                    }
                }
            }}
        />
    </div>
}
