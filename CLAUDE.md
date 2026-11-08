# Development guide

Read [AGENTS.md](AGENTS.md) for repository conventions, [README.md](README.md) for deployment and upgrades, and [API.md](API.md) for HTTP contracts. Document current code rather than assuming an older design still applies.

## Architecture

- `mediamtx.yml`: RTSP sources, native fMP4 recording, age-based retention, low-latency HLS, and native MP4 playback. MediaMTX owns persistent recordings.
- `api/main.go`: Go HTTP routes, cookie authentication middleware, embedded `dist` static UI, and port 8671.
- `api/internal/cameras`: MediaMTX control API discovery with a two-second cache; cameras are sorted by name and include online/track metadata.
- `api/internal/handlers`: authentication, camera JSON, on-demand snapshots, recording windows, buffered MP4 playback, and live HLS proxy.
- `api/internal/mediamtx`: control/playback/HLS integration and internal HTTP Basic credentials.
- `api/internal/playback`: bounded in-memory clips, shared fetches, media-duration parsing, and seekable HTTP responses.
- `api/internal/snapshots`: shared ffmpeg grabs, five-second result caching, and last-good-frame fallback. No persistent preview files.
- `ui/src/components`: login/offline states, camera overview, and timeline player. Hooks and services own polling, visibility, authentication, and network access.
- `ui/src/components/player/engine.ts`: live HLS plus recorded MP4 playback and media handoffs. Timeline/day data are separate from media transport.
- `Dockerfile`: Node UI build → Go build with embedded UI → Alpine runtime with ffmpeg. Go is built without CGO.

## Key decisions

- No recording filesystem mount in tapes. Discover cameras and footage through MediaMTX, not local scans. Only MediaMTX expires footage, using `recordDeleteAfter`; there is no disk-budget retention.
- Native recorded MP4 is buffered before delivery to support stable length, byte ranges, HEAD, and seeking. Memory is bounded by `PLAYBACK_CACHE_MB`; capacity failures return 503 rather than spilling to disk.
- Live uses native HLS where available and hls.js otherwise. This is not a transcoding service; camera codecs must work in the target browser.
- All media routes use the same-origin authentication cookie. Keep control/playback services internal and avoid leaking their credentials to browsers.
- UTC instants cross the API; local calendar days are a UI concern. Keep gaps and missing footage explicit instead of inventing continuous availability.
- The UI is a hash-routed PWA. Only static shell assets are precached. API, JPEG, HLS, and MP4 requests go to the network, preserving authentication and Range behavior. Updates require user confirmation rather than interrupting playback.

## UI design rules

- Dark-only, black-and-gray camera-first interface, including the PWA shell and icons. Reuse tokens and shared controls in `ui/src/styles/base.css`; use existing surface, text, border, radius, and spacing conventions.
- Selection and recorded footage use grayscale accents; red denotes live state, green denotes online, and yellow denotes offline. Pair color with text or icons. Keep the login form grayscale and free of branding.
- Keep video prominent, controls compact, and the timeline legible. Preserve responsive phone/desktop layouts, safe-area insets, and touch interactions (scrub, pinch/scroll zoom, horizontal pan).
- Use shared `Icon`, day chips, camera tiles, and button styles rather than introducing a separate visual system. Keep clear empty, loading, offline, error, and stale-snapshot states.
- Maintain accessible labels, visible keyboard focus, modal focus management, and keyboard shortcuts. Standard controls use the 44px tap token; do not shrink primary touch targets to fit content.
- Clean up polling, media listeners, object URLs, and effects. Visibility-aware fetching must not keep hidden views doing unnecessary work.

## Testing and development

Everything the project builds or tests runs in containers. Do not install dependencies directly into the checkout. `test.sh` copies sources into disposable container volumes and tears down its resources.

Run the tests with:

```bash
./test.sh ui     # TypeScript/Vite build, ESLint, Node tests
./test.sh api    # Go vet and race tests with an embed fixture
./test.sh stack  # Production image and synthetic RTSP integration stack
./test.sh        # Full suite; required before pushing
```

The stack stage uses a synthetic ffmpeg publisher and checks health/authentication, camera metadata, snapshots, HLS, recording spans, and MP4 ranges/HEAD. Tests must stay deterministic and use this isolated stack rather than real cameras. UI tests live in `ui/test/`, Go tests next to their packages, and shell assertion tests in `test/`.

For UI iteration use a Node container with dependencies on a container volume. Vite proxies API routes to `TAPES_API_URL` (default `http://localhost:8671` as seen from the UI container). The production Dockerfile supplies the embedded UI automatically; standalone Go compilation needs an `api/dist` directory first. Do not commit build output or screenshots.

## Known gotchas

- The supplied Compose file does not mount persistent recordings. Add a writable `/cameras` mount to MediaMTX before deployment. Camera subdirectories are created automatically; tapes needs only the password-file mount.
- Compose requires `MEDIAMTX_PASS` for both services. The API's internal username is fixed to `tapes` there; custom credentials require consistent MediaMTX permissions and deployment changes.
- RTSP reads are unauthenticated in the supplied MediaMTX configuration, including published port 8554. Keep that port on a trusted network.
- The authentication cookie currently has neither Secure nor HttpOnly set. Use TLS at the reverse proxy; do not describe the current cookie as hardened. Logout does not invalidate copies of the JWT.
- Snapshot failures can return an old good JPEG. Its `X-Snapshot-Time` is deliberately unchanged; never replace that with the response time. The ten-second grab budget excludes queueing behind the two worker slots.
- MP4 preparation happens even for HEAD. Allow long proxy read timeouts; disable buffering for live HLS. Do not add shared caches for private responses.
- Fractional seconds and timezone offsets in recording names matter to playback and daylight-saving transitions. Use the migration procedure in README for older names. MediaMTX only cleans paths still configured; removed-camera folders require manual deletion.
- MediaMTX uses mounted host timezone files while Compose's `TZ` defaults to UTC for tapes. Migration must use the zone the old names actually represent, not the browser's zone.
- Service workers require a secure context (HTTPS or localhost), are disabled in Vite development, and do not make video available offline. Preserve API navigation exclusions when changing PWA routes.

Review changes against the actual routes, environment lookups, deployment defaults, and tests. Keep behavior changes separate from documentation cleanup.
