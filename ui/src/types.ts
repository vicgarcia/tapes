// All times inside the app are epoch milliseconds. Services convert to and
// from the API's RFC3339 strings at the edge.

export type Camera = {
    type: 'camera'
    name: string
    online: boolean
    video: { codec: string, width: number, height: number } | null
}

/** A continuous stretch of recorded video. */
export type Span = {
    type: 'span'
    camera: string
    start: number
    end: number
}

/** A playable piece of recorded video: what /playback serves. */
export type Clip = {
    type: 'clip'
    camera: string
    start: number
    duration: number           // seconds, 1-600
}

export type Snapshot = {
    type: 'snapshot'
    camera: string
    url: string                // object url, revoke when replaced
    time: number | null
}

export type PlaybackRate = 1 | 2 | 4

export const PLAYBACK_RATES: PlaybackRate[] = [1, 2, 4];
