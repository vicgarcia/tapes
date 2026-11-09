// Playback engine for one camera: live HLS plus recorded playback in windows.
//
// Plain TypeScript (no React) so the timing logic doesn't depend on render
// cycles. React subscribes with useSyncExternalStore (see usePlayer).
//
// Recorded playback uses two <video> elements (slots). The active slot plays a
// window of about a minute from /playback; shortly before it ends the other slot
// preloads the next window (continuing where the clip really ended, or jumping
// over a recording gap to the next span). When the active one ends the slots
// swap. Short windows that load late keep slow links (cellular, VPN) from
// spending bandwidth on video that may never be watched.
// Seeks outside the current window load into the hidden slot and swap once
// the frame is ready, so the old picture stays up instead of flashing black.

import Hls from 'hls.js/light';
import { Clip, PlaybackRate } from '@app/types';
import { getClipUrl, getSpans, makeClip } from '@app/services/recordings';
import { getLiveUrl } from '@app/services/cameras';
import { formatClock, formatDuration, HOUR, SECOND } from '@app/lib/time';
import { hasStartBuffer } from '@app/lib/media';

/** A target this close to now plays live instead (recordings trail live by ~1s). */
export const LIVE_EDGE_MS = 10 * SECOND;
const PRE_ROLL_MS = 10 * SECOND;            // seek windows start a bit early so a 10s skip back stays in-window
const FIRST_WINDOW_MS = 60 * SECOND;        // a minute of video after the seek target…
const NEXT_WINDOW_S = 60;                   // …and a minute per continuation
const PRELOAD_LEAD_MS = 20 * SECOND;        // load the next window when this much wall time is left in the current one
const PRELOAD_RETRY_MS = 5 * SECOND;        // look again this often when nothing was found to preload
const STALL_MS = 600;                       // a playing video whose picture hasn't moved this long is stalled
const GAP_NOTICE_MS = 1500;                 // jumps longer than this are announced
// Span starts come back truncated to milliseconds while mediamtx keeps
// microseconds, so asking for exactly span.start can land a hair before the
// recording and 404. Start a few ms in.
const SPAN_START_SLACK_MS = 10;
const MAX_LOAD_FAILURES = 3;
// The playhead is pushed to React ~12 times a second, not every frame:
// re-rendering the timeline at 60fps competed with video decoding and made
// 2x playback stutter in Edge. Jumps (seeks, gap skips) go out immediately.
const EMIT_INTERVAL_MS = 80;

export type Notice = { id: number, text: string }

export type LiveStatus = 'connecting' | 'playing' | 'stalled' | 'error'
export type PlaybackStatus = 'loading' | 'ready' | 'buffering' | 'end' | 'error'

export type PlayerState =
    | { type: 'live', status: LiveStatus, time: number | null, rate: PlaybackRate, notice: Notice | null }
    | { type: 'playback', status: PlaybackStatus, time: number, playing: boolean, rate: PlaybackRate, notice: Notice | null }

type Phase = 'idle' | 'loading' | 'seeking' | 'ready' | 'error'

type Slot = {
    video: HTMLVideoElement
    clip: Clip | null
    end: number | null          // real end of the clip, known once metadata is in
    offset: number              // seconds to seek to once loaded
    phase: Phase
    activate: boolean           // become the visible slot as soon as ready
}

type Playable = { at: number, spanStart: number }

export class PlayerEngine {
    private camera: string;
    private state: PlayerState;
    private listeners = new Set<() => void>();
    private liveEl: HTMLVideoElement | null = null;
    private slots: Slot[] = [];
    private active = 0;
    private hls: Hls | null = null;
    private liveRetry: number | undefined;
    private raf = 0;
    private generation = 0;      // bumps on every seek / mode change; stale async work checks it
    private failures = 0;          // consecutive clip load errors
    private ending = false;
    private lastAdvance = { position: -1, at: 0 };   // stall watchdog
    private moved = { position: -1, at: 0 };         // last time the visible video advanced (buffering spinner)
    private nextAt = 0;         // performance.now() before which no next window is looked for
    private pace: { at: number, position: number } | null = null;   // fast-rate assist
    private lastEmit = 0;       // onEnded in progress (the frame loop must not re-enter it)
    private noticeId = 0;
    private noticeTimer: number | undefined;
    private cleanup: (() => void)[] = [];

    constructor(camera: string, start: number | null) {
        this.camera = camera;
        this.state = start === null
            ? { type: 'live', status: 'connecting', time: null, rate: 1, notice: null }
            : { type: 'playback', status: 'loading', time: start, playing: true, rate: 1, notice: null };
    }

    // ---- store interface ----------------------------------------------------

    getState = () => this.state;

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    private set(next: PlayerState) {
        this.state = next;
        this.listeners.forEach(l => l());
    }

    private patch(changes: Partial<PlayerState>) {
        this.set({ ...this.state, ...changes } as PlayerState);
    }

    private notify(text: string) {
        window.clearTimeout(this.noticeTimer);
        this.patch({ notice: { id: ++this.noticeId, text } });
        this.noticeTimer = window.setTimeout(() => this.patch({ notice: null }), 3500);
    }

    // ---- lifecycle ----------------------------------------------------------

    attach(live: HTMLVideoElement, a: HTMLVideoElement, b: HTMLVideoElement) {
        this.liveEl = live;
        this.slots = [a, b].map(video => ({ video, clip: null, end: null, offset: 0, phase: 'idle' as Phase, activate: false }));
        for (const video of [live, a, b]) {
            video.muted = true;
            video.playsInline = true;
        }
        this.slots.forEach((slot, i) => this.listenSlot(slot, i));
        this.listenLive(live);
        this.showSlot(null);

        const onVisibility = () => {
            if (this.state.type !== 'live') return;
            if (document.visibilityState === 'hidden') this.stopLive();
            else this.startLive();
        };
        document.addEventListener('visibilitychange', onVisibility);
        this.cleanup.push(() => document.removeEventListener('visibilitychange', onVisibility));

        const tick = () => {
            this.sample();
            this.raf = requestAnimationFrame(tick);
        };
        this.raf = requestAnimationFrame(tick);

        const s = this.state;
        if (s.type === 'live') this.goLive();
        else this.seek(s.time, true);
    }

    detach() {
        this.generation++;
        cancelAnimationFrame(this.raf);
        window.clearTimeout(this.liveRetry);
        window.clearTimeout(this.noticeTimer);
        this.cleanup.forEach(fn => fn());
        this.cleanup = [];
        this.stopLive();
        this.slots.forEach(slot => this.unload(slot));
    }

    // ---- commands -----------------------------------------------------------

    /** Play recordings from wall-clock time `target` (or go live when that is ~now). */
    async seek(target: number, play?: boolean) {
        const s = this.state;
        const wantPlay = play ?? (s.type === 'live' ? true : s.playing);
        if (target >= Date.now() - LIVE_EDGE_MS) {
            if (wantPlay || s.type === 'live') return this.goLive();
            target = Date.now() - LIVE_EDGE_MS;
        }
        const gen = ++this.generation;
        this.stopLive();
        this.resetPlaybackFlags();
        this.set({ type: 'playback', status: 'loading', time: target, playing: wantPlay, rate: s.rate, notice: s.notice });

        // fast paths: inside the visible window, or inside the preloaded one
        const active = this.slots[this.active];
        const other = this.slots[1 - this.active];
        this.pace = null;
        if (this.contains(active, target)) {
            active.video.currentTime = (target - active.clip!.start) / 1000;
            this.patch({ status: active.video.seeking ? 'buffering' : 'ready' });
            this.applyPlay();
            return;
        }
        if (other.phase === 'ready' && this.contains(other, target)) {
            other.video.currentTime = (target - other.clip!.start) / 1000;
            this.activateSlot(1 - this.active);
            return;
        }

        let playable: Playable | null;
        try {
            playable = await this.findPlayable(target);
        } catch {
            this.recordingsFailed(gen);
            return;
        }
        if (gen !== this.generation) return;
        if (playable === null) {
            this.patch({ status: 'end', time: target });
            this.notify(`No recordings after ${formatClock(target)}`);
            return;
        }
        if (playable.at - target > GAP_NOTICE_MS) {
            this.notify(`No recording at ${formatClock(target)}, jumped ahead ${formatDuration(playable.at - target)}`);
        }
        const start = Math.max(playable.spanStart, playable.at - PRE_ROLL_MS);
        const length = Math.min(playable.at + FIRST_WINDOW_MS, Date.now()) - start;
        this.patch({ time: playable.at });
        active.video.pause();             // keep the old frame up, frozen, until the new one is ready
        this.load(1 - this.active, makeClip(this.camera, start, length / 1000), (playable.at - start) / 1000, true);
    }

    goLive() {
        this.generation++;
        this.resetPlaybackFlags();
        this.slots.forEach(slot => this.unload(slot));
        this.showSlot(null);
        this.set({ type: 'live', status: 'connecting', time: null, rate: this.state.rate, notice: this.state.notice });
        this.startLive();
    }

    play() {
        const s = this.state;
        if (s.type === 'live') return;
        if (s.status === 'end') return this.seek(s.time, true);
        this.patch({ playing: true });
        this.applyPlay();
    }

    /** Pausing live freezes the current frame's time and continues as recorded playback. */
    pause() {
        const s = this.state;
        if (s.type === 'live') {
            this.seek(s.time ?? Date.now() - LIVE_EDGE_MS, false);
            return;
        }
        this.patch({ playing: false });
        this.applyPlay();
    }

    toggle() {
        const s = this.state;
        if (s.type === 'playback' && !s.playing) this.play();
        else this.pause();
    }

    skip(deltaMs: number) {
        const s = this.state;
        if (s.type === 'live') {
            if (deltaMs < 0) this.seek((s.time ?? Date.now()) + deltaMs, true);
            return;
        }
        this.seek(s.time + deltaMs);
    }

    setRate(rate: PlaybackRate) {
        this.pace = null;
        this.patch({ rate });
        this.slots.forEach(slot => { slot.video.playbackRate = rate; });
    }

    // ---- recorded playback --------------------------------------------------

    private resetPlaybackFlags() {
        this.ending = false;
    }

    private contains(slot: Slot, t: number): boolean {
        return slot.clip !== null && slot.end !== null && slot.phase === 'ready'
            && t >= slot.clip.start && t < slot.end - 250;
    }

    /** First recorded moment at or after `t`, from fresh span data. */
    private async findPlayable(t: number): Promise<Playable | null> {
        const spans = await getSpans(this.camera, t - PRE_ROLL_MS - SECOND, Math.min(t + 24 * HOUR, Date.now() + HOUR));
        for (const span of spans) {
            const spanStart = span.start + SPAN_START_SLACK_MS;
            const at = Math.max(spanStart, t);
            if (span.end - at > 500) return { at, spanStart };
        }
        return null;
    }

    private recordingsFailed(gen: number) {
        if (gen !== this.generation || this.state.type !== 'playback') return;
        this.ending = false;
        this.patch({ status: 'error', notice: null });
        this.applyPlay();
    }

    private load(index: number, clip: Clip, offset: number, activate: boolean) {
        const slot = this.slots[index];
        slot.clip = clip;
        slot.end = null;
        slot.offset = offset;
        slot.phase = 'loading';
        slot.activate = activate;
        slot.video.preload = 'auto';
        slot.video.playbackRate = this.state.rate;
        slot.video.src = getClipUrl(clip);
        slot.video.load();
    }

    private unload(slot: Slot) {
        slot.clip = null;
        slot.end = null;
        slot.phase = 'idle';
        slot.activate = false;
        slot.video.pause();
        slot.video.removeAttribute('src');
        slot.video.load();
    }

    private listenSlot(slot: Slot, index: number) {
        const v = slot.video;
        const on = (type: string, fn: () => void) => {
            v.addEventListener(type, fn);
            this.cleanup.push(() => v.removeEventListener(type, fn));
        };
        on('loadedmetadata', () => {
            if (!slot.clip || slot.phase !== 'loading') return;
            slot.end = slot.clip.start + v.duration * 1000;
            if (slot.offset > 0.05 && slot.offset < v.duration) {
                slot.phase = 'seeking';
                v.currentTime = slot.offset;
            }
        });
        // ready once there is enough to play without stalling a second later
        // (paused, the frame at the playhead is enough); re-checked as data arrives
        const ready = () => {
            if (slot.phase !== 'loading' && slot.phase !== 'seeking') return;
            if (slot.end === null || v.seeking) return;
            if (slot.phase === 'loading' && slot.offset > 0.05 && slot.offset < v.duration) return;   // seek to offset pending
            if (!this.canStart(v)) return;
            slot.phase = 'ready';
            v.playbackRate = this.state.rate;
            if (slot.activate) this.activateSlot(index);
        };
        on('seeked', ready);
        on('canplay', ready);
        on('progress', ready);
        on('canplaythrough', ready);
        // waiting/seeking/stalls of the active slot are picked up by the frame loop (sample)
        on('ended', () => { if (index === this.active) this.onEnded(); });
        on('error', () => {
            if (!slot.clip) return;
            const failed = slot.clip;
            const wasActive = slot.activate || index === this.active;
            slot.phase = 'error';
            if (!wasActive || this.state.type !== 'playback') return;
            // nothing recorded at the clip start after all (span data raced,
            // recording deleted…): step past it, a few times at most
            this.failures++;
            if (this.failures > MAX_LOAD_FAILURES) {
                this.failures = 0;
                this.patch({ status: 'error' });
                return;
            }
            const gen = this.generation;
            this.findPlayable(failed.start + this.failures * 2 * SECOND).then(p => {
                if (gen !== this.generation || this.state.type !== 'playback') return;
                if (p === null) return this.patch({ status: 'end' });
                const length = Math.min(Date.now(), p.at + FIRST_WINDOW_MS) - p.at;
                this.load(index, makeClip(this.camera, p.at, length / 1000), 0, true);
            }).catch(() => this.recordingsFailed(gen));
        });
    }

    private activateSlot(index: number) {
        const previous = this.slots[this.active];
        const slot = this.slots[index];
        slot.activate = false;
        this.failures = 0;
        this.pace = null;
        this.resetPlaybackFlags();
        if (index !== this.active) {
            previous.video.pause();
            this.active = index;
        }
        this.showSlot(index);
        if (this.state.type === 'playback') {
            this.patch({ status: 'ready', time: slot.clip!.start + slot.video.currentTime * 1000 });
        }
        this.applyPlay();
        // the old slot becomes the preloader, loaded once the new window is nearly done (sample)
        if (index !== this.slots.indexOf(previous)) this.unload(previous);
        this.nextAt = 0;
    }

    private applyPlay() {
        const s = this.state;
        const video = this.slots[this.active]?.video;
        if (!video || s.type !== 'playback') return;
        video.playbackRate = s.rate;
        // only 'ready' plays: while buffering the video is held paused until it has a start buffer (sample)
        if (s.playing && s.status === 'ready') {
            video.play().catch(() => {
                // autoplay refused (e.g. no user gesture yet): show as paused
                if (this.state.type === 'playback') this.patch({ playing: false });
            });
        } else {
            video.pause();
        }
    }

    /** Start loading the next window once the active one has PRELOAD_LEAD_MS left at the current rate. */
    private maybePreload(active: Slot, time: number, rate: PlaybackRate) {
        const next = this.slots[1 - this.active];
        if (next.phase !== 'idle' || active.end === null) return;
        const now = performance.now();
        if (now < this.nextAt || (active.end - time) / rate > PRELOAD_LEAD_MS) return;
        this.nextAt = now + PRELOAD_RETRY_MS;
        this.preloadNext();
    }

    /** Queue the window after the active one into the hidden slot. */
    private async preloadNext() {
        const active = this.slots[this.active];
        if (!active.clip || active.end === null) return;
        const from = active.end;
        const gen = this.generation;
        // the clip runs up to (almost) now: what comes next is still being
        // recorded, maybePreload looks again in a few seconds
        if (from + LIVE_EDGE_MS + 6 * SECOND > Date.now()) return;
        let playable: Playable | null;
        try {
            playable = await this.findPlayable(from);
        } catch {
            // Speculative failure must not interrupt the active clip. onEnded
            // checks again and presents an error if continuation is unavailable.
            return;
        }
        if (gen !== this.generation || this.slots[1 - this.active].phase !== 'idle') return;
        if (playable === null) return;   // nothing after this clip yet; looked for again, and onEnded checks too
        const length = Math.min(NEXT_WINDOW_S, (Date.now() - playable.at) / 1000);
        if (length < 2) return;
        this.load(1 - this.active, makeClip(this.camera, playable.at, length), 0, false);
    }

    private async onEnded() {
        const s = this.state;
        if (s.type !== 'playback' || this.ending) return;
        this.ending = true;
        const active = this.slots[this.active];
        const next = this.slots[1 - this.active];
        const endedAt = active.end ?? s.time;

        if (endedAt >= Date.now() - LIVE_EDGE_MS - 5 * SECOND) {
            this.goLive();
            this.notify('Caught up, back to live');
            return;
        }
        if (next.clip && next.phase === 'ready') {
            if (next.clip.start - endedAt > GAP_NOTICE_MS) this.notify(`Skipped ${formatDuration(next.clip.start - endedAt)} gap`);
            this.activateSlot(1 - this.active);
            return;
        }
        if (next.clip && (next.phase === 'loading' || next.phase === 'seeking')) {
            next.activate = true;
            this.patch({ status: 'buffering', time: endedAt });
            return;
        }
        // no next window queued (span data was behind, or the preload failed)
        const gen = this.generation;
        this.patch({ status: 'buffering', time: endedAt });
        let playable: Playable | null;
        try {
            playable = await this.findPlayable(endedAt);
        } catch {
            this.recordingsFailed(gen);
            return;
        }
        if (gen !== this.generation) return;
        this.ending = false;
        if (playable === null) {
            if (endedAt > Date.now() - 2 * 60 * SECOND) return this.goLive();
            this.patch({ status: 'end' });
            this.notify('End of recordings');
            return;
        }
        this.seek(playable.at, true);
    }

    /** Push the playhead from the visible video into the state (every animation frame). */
    private sample() {
        const s = this.state;
        if (s.type === 'playback') {
            const slot = this.slots[this.active];
            if (s.status !== 'ready' && s.status !== 'buffering') return;
            if (!slot.clip || slot.phase !== 'ready') return;
            const time = slot.clip.start + slot.video.currentTime * 1000;
            this.emitTime(time, s.time);
            // a stall (or seek) shows the spinner and holds the video paused until a start buffer is in,
            // so it resumes once instead of playing a second and stalling again; onEnded owns the status
            // while it swaps windows
            if (!this.ending) {
                if (s.status === 'ready' && this.stalled(slot.video, s.playing)) {
                    this.patch({ status: 'buffering' });
                } else if (s.status === 'buffering' && this.canStart(slot.video)) {
                    this.patch({ status: 'ready' });
                    this.applyPlay();
                }
                if (this.state.type === 'playback' && this.state.status === 'buffering' && !slot.video.paused) slot.video.pause();
            }
            this.maybePreload(slot, time, s.rate);
            this.watchdog(slot.video, s.playing);
            this.assistPace(slot.video, s.playing, s.rate);
            // reached the end without an 'ended' event (some browsers stop a few ms short)
            if (slot.end !== null && time >= slot.end - 40 && slot.video.paused && s.playing && !slot.video.seeking) this.onEnded();
        } else if (s.type === 'live' && this.liveEl) {
            const time = this.liveTime();
            if (time !== null) this.emitTime(time, s.time);
            if (s.status === 'playing' || s.status === 'stalled') {
                const stalled = this.stalled(this.liveEl, true, false);
                if (stalled !== (s.status === 'stalled')) this.patch({ status: stalled ? 'stalled' : 'playing' });
            }
        }
    }

    /**
     * Whether the visible video is seeking (when seeks count), or should be
     * playing but its picture hasn't moved for STALL_MS. readyState alone isn't
     * used: with LL-HLS's small buffer it dips below HAVE_FUTURE_DATA while
     * playing fine. Live doesn't count seeks: hls.js makes its own short jumps
     * to the live edge, which only matter if the picture freezes.
     */
    private stalled(video: HTMLVideoElement, playing: boolean, seeks = true): boolean {
        const now = performance.now();
        if (seeks && video.seeking) return true;
        if (!playing || video.paused || video.ended || video.currentTime !== this.moved.position) {
            this.moved = { position: video.currentTime, at: now };
            return false;
        }
        return now - this.moved.at > STALL_MS;
    }

    /** Enough data to show (paused) or play (a start buffer) from the playhead. */
    private canStart(video: HTMLVideoElement): boolean {
        const s = this.state;
        if (video.seeking) return false;
        if (s.type === 'playback' && !s.playing) return video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
        return hasStartBuffer(video, s.rate);
    }

    private emitTime(time: number, shown: number | null) {
        const now = performance.now();
        const delta = shown === null ? Infinity : Math.abs(time - shown);
        if (delta < 15) return;
        if (delta < 2000 && now - this.lastEmit < EMIT_INTERVAL_MS) return;
        this.lastEmit = now;
        this.patch({ time });
    }

    /**
     * A playing video that has data ahead but hasn't advanced for 3s gets a
     * tiny seek, which restarts a wedged decoder pipeline.
     */
    private watchdog(video: HTMLVideoElement, playing: boolean) {
        const now = performance.now();
        if (!playing || video.paused || video.seeking || video.currentTime !== this.lastAdvance.position) {
            this.lastAdvance = { position: video.currentTime, at: now };
            return;
        }
        if (now - this.lastAdvance.at < 3000) return;
        const b = video.buffered;
        const ahead = b.length ? b.end(b.length - 1) - video.currentTime : 0;
        this.lastAdvance = { position: video.currentTime, at: now };
        if (ahead > 1) video.currentTime = video.currentTime + 0.01;
    }

    /**
     * Above 4x browsers often can't decode every frame in time (8x of a 20fps
     * camera is 160 decoded frames/s) and playback crawls. When the video
     * falls behind where the rate says it should be, step it forward within
     * what is already buffered: a slightly choppier picture, but a real 8x.
     */
    private assistPace(video: HTMLVideoElement, playing: boolean, rate: PlaybackRate) {
        if (rate <= 4 || !playing || video.paused) {
            this.pace = null;
            return;
        }
        const now = performance.now();
        if (this.pace === null) {
            this.pace = { at: now, position: video.currentTime };
            return;
        }
        if (video.seeking) return;
        const expected = this.pace.position + (now - this.pace.at) / 1000 * rate;
        if (expected - video.currentTime < 1.5) return;
        const b = video.buffered;
        const bufferedTo = b.length ? b.end(b.length - 1) : 0;
        const target = Math.min(expected, bufferedTo - 0.5, video.duration - 0.3);
        if (target > video.currentTime + 0.5) video.currentTime = target;
    }

    private showSlot(index: number | null) {
        this.slots.forEach((slot, i) => slot.video.classList.toggle('is-visible', i === index));
        this.liveEl?.classList.toggle('is-visible', index === null);
    }

    // ---- live ---------------------------------------------------------------

    private liveTime(): number | null {
        if (this.hls) {
            const date = this.hls.playingDate;
            return date ? date.getTime() : null;
        }
        const video = this.liveEl as (HTMLVideoElement & { getStartDate?: () => Date }) | null;
        if (video?.getStartDate) {
            const start = video.getStartDate().getTime();
            if (!Number.isNaN(start) && start > 0) return start + video.currentTime * 1000;
        }
        return null;
    }

    private listenLive(v: HTMLVideoElement) {
        const on = (type: string, fn: () => void) => {
            v.addEventListener(type, fn);
            this.cleanup.push(() => v.removeEventListener(type, fn));
        };
        on('playing', () => { if (this.state.type === 'live') this.patch({ status: 'playing' }); });
        // stalls are detected by the frame loop from the picture not moving (sample)
        on('error', () => { if (this.state.type === 'live' && !this.hls) this.liveFailed(); });
    }

    private startLive() {
        const video = this.liveEl;
        if (!video || this.hls || video.getAttribute('src')) return;
        if (document.visibilityState === 'hidden') return;
        window.clearTimeout(this.liveRetry);
        const url = getLiveUrl(this.camera);

        if (Hls.isSupported()) {
            const hls = new Hls({
                enableWorker: true,
                // LL-HLS: play ~PART-HOLD-BACK behind the live edge, catching up at up to 1.5x after a stall
                lowLatencyMode: true,
                maxLiveSyncPlaybackRate: 1.5,
                backBufferLength: 30,
                manifestLoadPolicy: { default: { maxTimeToFirstByteMs: 10000, maxLoadTimeMs: 15000, timeoutRetry: { maxNumRetry: 3, retryDelayMs: 500, maxRetryDelayMs: 2000 }, errorRetry: { maxNumRetry: 3, retryDelayMs: 1000, maxRetryDelayMs: 4000 } } },
            });
            this.hls = hls;
            hls.on(Hls.Events.ERROR, (_event, data) => {
                if (!data.fatal) return;
                if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
                else this.liveFailed();
            });
            hls.loadSource(url);
            hls.attachMedia(video);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;           // Safari / iOS without MSE
        } else {
            this.patch({ status: 'error' });
            return;
        }
        video.play().catch(() => undefined);
    }

    private stopLive() {
        window.clearTimeout(this.liveRetry);
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }
        if (this.liveEl?.getAttribute('src')) {
            this.liveEl.pause();
            this.liveEl.removeAttribute('src');
            this.liveEl.load();
        }
    }

    private liveFailed() {
        this.stopLive();
        if (this.state.type !== 'live') return;
        this.patch({ status: 'error', time: null });
        this.liveRetry = window.setTimeout(() => {
            if (this.state.type === 'live') {
                this.patch({ status: 'connecting' });
                this.startLive();
            }
        }, 4000);
    }
}
