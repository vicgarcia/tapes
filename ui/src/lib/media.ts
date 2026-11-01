/** Seconds of video buffered from the playhead onward, in the buffered range that contains it. */
export function bufferedAhead(video: HTMLVideoElement): number {
    const t = video.currentTime;
    const b = video.buffered;
    for (let i = 0; i < b.length; i++) {
        if (b.start(i) <= t + 0.05 && b.end(i) > t) return b.end(i) - t;
    }
    return 0;
}

/** Seconds buffered before (re)starting: enough that a slow link doesn't stall again a second later. */
export const START_BUFFER_S = 3;

/**
 * Whether a playing video has enough buffered to start without stalling right
 * away: START_BUFFER_S of video at the current rate (capped), or all that is left.
 */
export function hasStartBuffer(video: HTMLVideoElement, rate: number): boolean {
    if (video.seeking || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false;
    const left = (video.duration || 0) - video.currentTime - 0.1;
    return bufferedAhead(video) >= Math.min(START_BUFFER_S * Math.min(rate, 2), left);
}
