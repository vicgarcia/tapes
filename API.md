# HTTP API

The Go server listens on `:8671` and serves the built UI at `/`. There is no API prefix or version segment. UI navigation uses hash routes. All routes below are same-origin; there is no CORS setup or bearer-token interface.

## Conventions and authentication

- Except for `GET /health` and `POST /login`, API routes require the `tapes` cookie. Missing, invalid, or expired cookies return `401` with plain text `unauthorized`.
- Login accepts form fields, not JSON. Credentials come from an htpasswd file. Successful login sets an HS256 JWT cookie with a three-hour lifetime. Tokens contain issuer, subject (username), and expiry. All authenticated users have the same access.
- The cookie has `Path=/`, `SameSite=Strict`, and `Max-Age=10800`. Currently **Secure and HttpOnly are false**. Deploy behind HTTPS and treat browser access as privileged. Logout clears the cookie; it does not revoke a copied token.
- Successful JSON responses use `Content-Type: application/json`. Most handler errors are `{"error":"message"}`; authentication middleware and invalid login credentials use plain text. Upstream live-stream responses may have their own error bodies.
- Camera names are MediaMTX path names, not numeric IDs. URL-encode them as path components.
- Query times accept RFC3339 timestamps, including offsets and fractional seconds. Encode `+` offsets as `%2B`. Recording span times and playback start headers are normalized to UTC with millisecond precision. Durations are seconds.

## Routes

| Method | Path | Result |
| --- | --- | --- |
| GET | `/health` | Public `{"status":"success","timezone":"America/New_York"}`; process liveness, not MediaMTX readiness. `timezone` is the app time zone from `TZ`, which the UI uses for days and clock labels, so it is available before login. |
| POST | `/login` | Form `username` and `password`; sets cookie and returns `{"status":"success"}`. Bad/missing credentials: 401; unreadable password file: 500. |
| POST | `/logout` | Requires a valid cookie; clears it and returns `{"status":"success"}`. |
| GET | `/auth` | Returns `{"status":"success"}` for a valid cookie. |
| GET | `/cameras` | Array of cameras, sorted by name; cached for two seconds. `video` comes from the first video track. MediaMTX failure, or no answer within five seconds: 502. |
| GET | `/cameras/{camera}` | One camera; missing: 404; discovery failure: 502. |
| GET | `/cameras/{camera}/snapshot` | On-demand JPEG; details below. |
| GET | `/cameras/{camera}/recordings` | Recorded spans in the requested time window; details below. |
| GET, HEAD | `/cameras/{camera}/playback` | Seekable MP4 clip; details below. |
| GET | `/cameras/{camera}/live/{suffix...}` | Proxied live HLS playlist, segment, or part. Begin with `index.m3u8`. Query parameters are forwarded. |

A camera object looks like:

```json
{"name":"garage","online":true,"video":{"codec":"H264","width":1920,"height":1080}}
```

`video` is `null` when usable track metadata is unavailable (including offline cameras). Camera discovery comes from the MediaMTX control API, not filesystem scanning.

### Snapshots

`GET /cameras/garage/snapshot` returns `image/jpeg`, `Cache-Control: no-store`, and `X-Snapshot-Time` (UTC RFC3339 with optional fractional seconds).

Frames are captured with ffmpeg from the configured RTSP base URL, only on request. Results, including failures, are cached for five seconds. Concurrent requests for one camera share a grab; at most two grabs run at once. Each grab has a ten-second process timeout, excluding queue time. A failed refresh serves the last good in-memory frame with its original capture timestamp. Nothing is written to disk.

Unknown cameras or cameras without any successful frame return 404. Discovery failure returns 502. A returned JPEG can be stale: inspect `X-Snapshot-Time` rather than assuming it was captured on this request.

### Recording spans

Required query parameters: `start` and `end`. The end must be later than the start, and the window must not exceed seven days.

```text
GET /cameras/garage/recordings?start=2026-11-01T00:00:00Z&end=2026-11-02T00:00:00Z
```

```json
{"spans":[{"start":"2026-11-01T10:00:00.000Z","end":"2026-11-01T10:05:00.000Z","duration":300}]}
```

Spans are clipped to the requested window, with durations rounded to milliseconds. No footage returns `{"spans":[]}`. Responses use `Cache-Control: no-store`. Invalid windows return 400, unknown cameras 404, and discovery or recording-service failures 502. There is no day parameter, file listing, or pagination.

### Playback

Required query parameters: `start` and numeric `duration` (inclusive range 1–600 seconds; fractional values allowed).

```text
GET /cameras/garage/playback?start=2026-11-01T10:00:00Z&duration=60
```

The API fetches MediaMTX's native MP4 output, buffers the complete clip in bounded memory, and serves it as `video/mp4`. No transcoding occurs. `HEAD` also prepares the clip but omits the body. Byte ranges and HTTP conditionals are supported via Go's `http.ServeContent` (`206` for satisfiable ranges, `416` for invalid ranges).

Headers include:

- `Accept-Ranges: bytes`, `Content-Length`, `ETag`, and `Last-Modified` on normal successful responses.
- `X-Playback-Start`: the requested start in UTC, millisecond precision.
- `X-Playback-Duration`: actual parsed media duration, to three decimal places. It can be shorter than requested near the recording edge.
- `Cache-Control: private, max-age=3600` for completed clips, or `private, no-cache` for growing clips.

Invalid parameters return 400; unknown cameras or no recording at the requested start return 404; exhausted playback cache budget returns 503; upstream/preparation failures return 502. Clip preparation can take time before any response bytes arrive. The upstream playback client timeout is two minutes; configure proxies with a longer read timeout.

### Live HLS

The live route checks camera existence and proxies the corresponding MediaMTX HLS path. It forwards query parameters (including low-latency HLS requests) and the response body, with only `Content-Type`, `Content-Length`, `Cache-Control`, `Last-Modified` and `ETag` from the upstream headers. It rejects `..` path components with 400. An unknown camera returns 404, and unavailable camera discovery 502. Upstream connection failures, upstream 401/403, and redirects become 502; redirects are followed only back to the HLS host. Other upstream statuses pass through.

There is no client timeout for live proxy requests. Reverse proxies must not buffer live responses; allow long reads. The browser uses native HLS when available and hls.js otherwise.

## Configuration

Environment values below configure the API process. The root `.env` is loaded by Compose; `api/env.template` is a reference, not an automatically loaded file for `go run`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `JWT_KEY` | none | Required signing secret; empty/whitespace-only values stop startup. |
| `JWT_ISSUER` | `tapes` | Issuer written into new tokens. |
| `PASSWORDS_PATH` | `/opt/tapes/passwords` | Readable htpasswd file. |
| `MEDIAMTX_API_URL` | `http://mediamtx:9997` | Camera discovery at `/v3/paths/list`. |
| `MEDIAMTX_PLAYBACK_URL` | `http://mediamtx:9996` | Recording `/list` and MP4 `/get`. |
| `MEDIAMTX_HLS_URL` | `http://mediamtx:8888` | Live HLS base. |
| `MEDIAMTX_RTSP_URL` | `rtsp://mediamtx:8554` | Snapshot source base. |
| `MEDIAMTX_USER` | `tapes` | HTTP Basic username for control and playback services. Compose fixes this to `tapes`. |
| `MEDIAMTX_PASS` | empty in API code | HTTP Basic password. Required by Compose; must match MediaMTX. |
| `PLAYBACK_CACHE_MB` | `256` | In-memory clip budget in MiB; invalid/nonpositive values fall back to 256. |
| `DEBUG` | `false` | Enables logger debug level for `true`, `1`, or `yes` (case-insensitive). |

The server logs every request (method, path, query, status, bytes, duration, remote address) and every upstream or internal failure at error level. Requests are logged at info level, except successful live HLS playlists, parts and segments after the first `index.m3u8`, which a viewer fetches several times a second; those are logged at debug level. Request headers must arrive within 10 seconds and request bodies within 30, and login bodies are limited to 4 KB. There is no write timeout, because of live playlists and clip preparation. SIGTERM stops accepting connections and waits up to 5 seconds for requests in flight.

Compose also supports `UID`/`GID` (default 1000), `TZ` (the app time zone, an IANA name, default UTC; an unknown name stops startup), and the endpoint overrides above. Configure cameras, recording paths, and age-based retention in `mediamtx.yml`, not through the API. Neither the API nor the UI edits configuration or deletes recordings. See [README.md](README.md) for deployment, persistent storage, and upgrades.
