# Agent guidance

## Project overview
Tapes records IP cameras with MediaMTX and serves them through a Go API in `api/` with an embedded React/TypeScript UI in `ui/`, deployed with Docker Compose. Read [README.md](README.md) for deployment and upgrades and [API.md](API.md) for HTTP contracts. Keep changes focused, follow established package boundaries and patterns, and document current code rather than assuming an older design still applies.

## Architecture
- `mediamtx.yml`: RTSP sources, native fMP4 recording, age-based retention, low-latency HLS, and native MP4 playback. MediaMTX owns persistent recordings.
- `api/main.go`: Go HTTP routes, cookie authentication middleware, request logging, embedded `dist` static UI, server timeouts and graceful shutdown, port 8671.
- `api/internal/cameras`: MediaMTX control API discovery with a two-second cache; cameras are sorted by name, with online status and the first video track's dimensions.
- `api/internal/handlers`: authentication, camera JSON, on-demand snapshots, recording windows, buffered MP4 playback, the live HLS proxy, and the request log.
- `api/internal/mediamtx`: control/playback/HLS integration and internal HTTP Basic credentials. Control API calls time out after five seconds.
- `api/internal/playback`: bounded in-memory clips, shared fetches, media-duration parsing, and seekable HTTP responses.
- `api/internal/snapshots`: shared ffmpeg grabs, five-second result caching, and last-good-frame fallback. No persistent preview files.
- `ui/src/components`: login/offline states, camera overview, and timeline player. Hooks and services own polling, visibility, authentication, and network access.
- `ui/src/components/player/engine.ts`: live HLS plus recorded MP4 playback and media handoffs. Timeline/day data are separate from media transport.
- `test.sh`, `test/`, and `.factory/`: integration test setup and project test workflow.
- `Dockerfile`: Node UI build → Go build with embedded UI → Alpine runtime with ffmpeg. Go is built without CGO.

## Key decisions
- No recording filesystem mount in tapes. Discover cameras and footage through MediaMTX, not local scans. Only MediaMTX expires footage, using `recordDeleteAfter`; there is no disk-budget retention.
- Native recorded MP4 is buffered before delivery to support stable length, byte ranges, HEAD, and seeking. Memory is bounded by `PLAYBACK_CACHE_MB`; capacity failures return 503 rather than spilling to disk.
- Live uses native HLS where available and hls.js otherwise. This is not a transcoding service; camera codecs must work in the target browser.
- All media routes use the same-origin authentication cookie. Keep control/playback services internal and avoid leaking their credentials or headers to browsers; the live proxy passes only an allowlist of media headers.
- No lock is held across a MediaMTX call, and every upstream call is bounded by a timeout or the request's context, so a stalled MediaMTX fails requests instead of hanging the API.
- UTC instants cross the API; calendar days and clock labels are a UI concern, in the app time zone from `TZ`. Keep gaps and missing footage explicit instead of inventing continuous availability.
- The UI is a hash-routed PWA. Only static shell assets are precached. API, JPEG, HLS, and MP4 requests go to the network, preserving authentication and Range behavior. Updates require user confirmation rather than interrupting playback.

## Comments and formatting
- Keep comments terse and useful: explain intent, constraints, non-obvious behavior, or public contracts. Do not narrate code or repeat what the code already makes clear.
- Apply the same comment standard to Go, JavaScript, and TypeScript. Write comments in clear, grammatical sentences; avoid shorthand, stale notes, decorative prose, and unnecessary commentary.
- In Go, document exported package-level names with a doc comment beginning with the name (for example, `// GetAll returns ...`). Add package comments when they clarify the package's purpose.
- Keep implementation comments next to the code they explain. Document important reasoning around security, concurrency, filesystem behavior, and external integrations.
- Preserve required directives and markers, including `//go:embed`, build tags, and generated-code markers, in their required form.
- In code and configuration files, group related statements or settings together and use blank lines between distinct logical blocks. Keep configuration comments terse and adjacent to the setting they describe.

## Go conventions
- Follow idiomatic Go and standard-library conventions. Run `gofmt` on changed Go files and keep imports organized: standard-library imports first, external dependencies second, and internal project imports last, with blank lines between groups.
- Use meaningful names and small, cohesive functions. Return errors to callers that can handle them, wrapping with `%w` when adding context. Check errors at the operation that produces them; avoid ignored errors unless intentional and documented.
- Do not panic for ordinary runtime failures. Clean up resources explicitly, using `defer` where appropriate.
- Keep APIs and data ownership clear. Avoid unnecessary global state, duplication, and abstractions that do not reduce complexity. Use context cancellation for work tied to a request or service lifecycle.
- Prefer standard-library facilities and established dependencies. Validate and constrain untrusted input, especially paths, identifiers, and request data. Do not expose secrets in responses or logs.
- Log through the logger package, using stable, descriptive messages and key/value attributes rather than string interpolation. Every request is logged by the middleware; handlers log each upstream or internal failure at error level, and successful live HLS detail is logged at debug level with the camera and cause, and skip it when the client has gone away.

## JavaScript and TypeScript conventions
- Follow the existing React and TypeScript patterns; use the project's lint and typecheck scripts for relevant changes.
- Prefer explicit types and clear, descriptive names. Keep components and functions focused, use existing service layers for API interactions, and avoid duplicated logic or unnecessary abstractions.
- Handle asynchronous work and errors deliberately. Clean up effects and other resources when their lifecycle ends. Validate untrusted data at appropriate boundaries and do not expose secrets.
- Keep UI behavior accessible and maintain compatibility with backend API and JSON contracts. Update tests and documentation when behavior or contracts change.

## UI design rules
- Dark-only, black-and-gray camera-first interface, including the PWA shell and icons. Reuse tokens and shared controls in `ui/src/styles/base.css`; use existing surface, text, border, radius, and spacing conventions.
- Selection and recorded footage use grayscale accents; red denotes live state, green denotes online, and yellow denotes offline. Pair color with text or icons. Keep the login form grayscale and free of branding.
- Keep video prominent, controls compact, and the timeline legible. Preserve responsive phone/desktop layouts, safe-area insets, and touch interactions (scrub, pinch/scroll zoom, horizontal pan). The player has no camera selector; switching cameras goes through the home page.
- Use shared `Icon`, day chips, camera tiles, and button styles rather than introducing a separate visual system. Keep clear empty, loading, offline, error, and stale-snapshot states.
- Maintain accessible labels, visible keyboard focus, modal focus management, and keyboard shortcuts. Standard controls use the 44px tap token; do not shrink primary touch targets to fit content.
- Clean up polling, media listeners, object URLs, and effects. Visibility-aware fetching must not keep hidden views doing unnecessary work.

## Configuration and deployment
- Keep Dockerfiles, Compose files, MediaMTX settings, environment templates, and other configuration consistent with existing conventions and documented runtime behavior.
- Group related settings into logical blocks separated by blank lines. Use concise comments to explain non-obvious choices; avoid comments that merely restate a setting.
- Avoid committing secrets or machine-specific values. When changing configuration, update relevant templates and documentation together and verify the resulting configuration with available project checks.

## Testing and review
- Everything the project builds or tests runs in containers. Do not install dependencies directly into the checkout. `test.sh` copies sources into disposable container volumes and tears down its resources.
- In the Software Factory, use `factory-test ui`, `factory-test api`, or `factory-test stack` while working, and the full `factory-test` run before pushing. These forward to `./test.sh [ui|api|stack]`, which is the entry point outside the factory; no argument runs everything.
  - `ui`: TypeScript/Vite build, ESLint, Node tests.
  - `api`: Go vet and race tests with an embed fixture.
  - `stack`: production image and a synthetic RTSP stack checking health/authentication, camera metadata, snapshots, HLS, recording spans, and MP4 ranges/HEAD.
- Add or update tests for behavior changes and edge cases. Keep tests deterministic and isolated, using the synthetic stack rather than real cameras. UI tests live in `ui/test/`, Go tests next to their packages, and shell assertion tests in `test/`.
- For UI iteration use a Node container with dependencies on a container volume. Vite proxies API routes to `TAPES_API_URL` (default `http://localhost:8671` as seen from the UI container). Standalone Go compilation needs an `api/dist` directory first. Do not commit build output or screenshots, except the README's in `docs/screenshots/`, which use generated test cameras only, never real camera footage.
- Review `git diff` for correctness, scope, formatting, and stale comments before committing. Keep behavior changes separate from documentation cleanup, and avoid generated files or unrelated formatting changes unless required.

## Known gotchas
- The supplied Compose file records to `./data/cameras` on MediaMTX. That folder must exist and be writable by the configured UID/GID before starting; Docker creates a missing one owned by root, and MediaMTX then records nothing while live view still works. Camera subfolders are created automatically; tapes needs only the password-file mount.
- Compose requires `MEDIAMTX_PASS` for both services. The API's internal username is fixed to `tapes` there; custom credentials require consistent MediaMTX permissions and deployment changes.
- RTSP reads are unauthenticated in the supplied MediaMTX configuration, including published port 8554. Keep that port on a trusted network.
- The authentication cookie currently has neither Secure nor HttpOnly set. Use TLS at the reverse proxy; do not describe the current cookie as hardened. Logout does not invalidate copies of the JWT.
- Snapshot failures can return an old good JPEG. Its `X-Snapshot-Time` is deliberately unchanged; never replace that with the response time. The ten-second grab budget excludes queueing behind the two worker slots.
- MP4 preparation happens even for HEAD. Allow long proxy read timeouts; disable buffering for live HLS. Do not add shared caches for private responses.
- The server's 30-second read timeout bounds request bodies only; in Go it doesn't cancel long GET responses or stop disconnect detection. There is deliberately no write timeout, which would cut off live playlists and clip preparation.
- A live viewer fetches HLS playlists, parts and segments several times a second. The request log records those at debug level, keeping info for the first `index.m3u8` and any failure; don't move them back to info.
- Fractional seconds and timezone offsets in recording names matter to playback and daylight-saving transitions. Use the migration procedure in README for older names. MediaMTX only cleans paths still configured; removed-camera folders require manual deletion.
- `TZ` is the app time zone (default UTC). Go loads it with compiled-in zone data and sets `time.Local`, so log timestamps use it; `/health` reports it and the UI applies it with `setTimeZone` before rendering. Calendar and clock code must go through `ui/src/lib/time.ts`, never `Date` local-time methods or `Intl` formatters without the zone. MediaMTX uses the host's timezone files for its own logs. Migration must use the zone the old names actually represent, not the app or browser zone.
- Service workers require a secure context (HTTPS or localhost), are disabled in Vite development, and do not make video available offline. Preserve API navigation exclusions when changing PWA routes.
