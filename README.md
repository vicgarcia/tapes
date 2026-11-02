I've been tinkering with IP cameras at home for years. What started as a single camera watching the driveway turned into a multi-camera system, and with it came the realization that commercial solutions were either too expensive, too limited, or required subscriptions that felt unnecessary. I wanted something simple: capture video from my cameras continuously, store it efficiently, and make it available for whatever I needed—whether that was viewing in HomeKit, running AI detection, or just reviewing footage when the neighbor's cat set off the motion sensor again.

tapes is the result of that journey. It's built around a straightforward idea: use proven open-source tools to capture RTSP streams from IP cameras, save continuous recordings in manageable interval files, and provide a foundation for everything else. The recordings become source material for external AI analysis, live viewing through HomeKit, or simply browsing through footage when you need to see what happened last Tuesday afternoon.

This isn't trying to be a complete commercial NVR replacement with every feature imaginable. Instead, it's a solid foundation that handles the core job well—continuous recording with a clean web interface—and stays out of your way when you want to build on top of it. The system has been running in production for months, quietly doing its job while I've refined the pieces that matter.

MediaMTX now handles both recording and native playback. There are no generated thumbnails or background file-processing jobs: camera previews are on-demand snapshots held in memory.

## Overview

- **MediaMTX** pulls RTSP camera streams, records fragmented MP4, serves live HLS and recorded MP4, and expires old recordings.
- **tapes** is a Go API with an embedded React/TypeScript UI. It discovers cameras through MediaMTX, authenticates viewers, and proxies video. ffmpeg captures on-demand JPEG previews.
- **Storage** belongs to MediaMTX only. The tapes container does not need a recordings mount or a database.

## Setup

You need Docker with the Compose plugin, RTSP cameras, and disk space for recordings.

### 1. Download configuration

```bash
mkdir -p ~/tapes && cd ~/tapes
curl -O https://raw.githubusercontent.com/vicgarcia/tapes/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/vicgarcia/tapes/main/mediamtx.yml
curl -o .env https://raw.githubusercontent.com/vicgarcia/tapes/main/.env.template
```

Edit `.env` and set **both** `JWT_KEY` and `MEDIAMTX_PASS` to separate random secrets:

```bash
openssl rand -hex 32  # JWT_KEY
openssl rand -hex 16  # MEDIAMTX_PASS
```

Compose gives the API and MediaMTX the same `MEDIAMTX_PASS`; the internal username is `tapes`. Optional `UID` and `GID` default to `1000:1000`. `TZ` defaults to UTC for tapes; MediaMTX uses the host's mounted timezone files. See [API.md](API.md) for API configuration.

### 2. Create the password file

Using `htpasswd` (from your distribution's Apache utilities):

```bash
htpasswd -c passwords admin
htpasswd passwords viewer  # optional additional user; do not use -c again
```

The supplied Compose file mounts `./passwords` read-only at `/opt/tapes/passwords`. Ensure the configured container user can read it.

### 3. Add cameras and persistent storage

Edit `paths` in `mediamtx.yml`:

```yaml
paths:
  garage:
    source: rtsp://user:password@192.168.1.101:554/live/ch0
  kitchen:
    source: rtsp://user:password@192.168.1.102:554/live/ch0
```

Add a persistent recordings mount to the **mediamtx** service in `docker-compose.yml` (the downloaded file does not include one):

```yaml
    volumes:
      # Keep the existing timezone and mediamtx.yml mounts too.
      - /srv/tapes/recordings:/cameras
```

Make the parent storage directory writable by the configured UID/GID. **Do not create individual camera folders**; MediaMTX creates them. Do not add this mount to tapes.

Defaults record five-minute fMP4 segments, flushing parts every second, at `/cameras/%path/%Y%m%d%H%M%S-%f%z.mp4`. The fractional seconds are required for playback; the timezone offset distinguishes repeated local times at the end of daylight saving time.

### 4. Start

```bash
docker compose up -d
docker compose ps
docker compose logs
```

Open `http://<server-ip>:8671`. Images are pulled from the registries; no local build is required. Port 8554 exposes read-only RTSP without a password in the supplied configuration. Restrict it to trusted networks; do not expose internal MediaMTX HTTP services publicly.

## Usage

Sign in with your password-file credentials. The home page shows camera snapshots and connection status. Open a camera for live video, select a day, and click or drag the timeline to review recordings. Zoom between 24h, 1h and 10m; gaps indicate missing footage. Use Live to return to the current stream, and `?` for keyboard shortcuts.

Recorded playback uses MediaMTX's native MP4 output through the API, not transcoding. Live playback uses native HLS where supported and hls.js elsewhere. Browser codec support still matters; H.264 is the safest camera setting.

On HTTPS (or localhost), supported browsers can install tapes as a home-screen app. Only the application shell is cached, never footage or API responses. Offline mode cannot play recordings. Updates prompt before reloading so they do not interrupt viewing.

## Storage and retention

MediaMTX is the **only** thing that deletes recordings, using `recordDeleteAfter` in `mediamtx.yml`. Deletion is by age only, with **no disk limit**. The default is `90d`; use `0s` to keep forever. It only cleans cameras still listed in `mediamtx.yml`, so a removed camera's folder must be deleted by hand.

Check free disk space regularly (`df -h /srv/tapes/recordings`) and size storage for the aggregate bitrate and retention period. A continuous 2–4 Mbps stream uses roughly 22–43 GB per day per camera, before overhead. The UI does not manage retention or remove files.

## Reverse proxy

Terminate TLS at a reverse proxy. Give clip preparation a long read timeout and disable response buffering for live HLS:

```nginx
server {
    listen 443 ssl;
    server_name cameras.example.com;
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:8671;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 300s;
        # Applies to live playlists and parts as well as other responses.
        proxy_buffering off;
    }
}
```

Keep the API and media routes on the same origin; authentication uses a cookie. Do not configure shared caching for authenticated responses. See [API.md](API.md) for the cookie's current security flags.

## Upgrading from the older recording layout

1. Back up configuration, credentials, and recordings, then stop the stack (`docker compose down`).
2. Download the new `docker-compose.yml` and `mediamtx.yml`. Move your camera paths into the new MediaMTX configuration and restore the persistent recordings mount on MediaMTX only. Preserve any other deployment-specific settings deliberately.
3. Set `MEDIAMTX_PASS` in `.env` and keep a strong `JWT_KEY`.
4. If you changed `RETENTION_DAYS`, set the same period in `recordDeleteAfter` (for example, `30d`). The old variable is ignored; the new default is 90 days. An old value of `0` becomes `0s`, keeping recordings forever.
5. Download `scripts/migrate-recordings.sh` from this repository and run it while the stack is stopped, with `TZ` set to the zone recordings were written in. Start with a dry run:

   ```bash
   TZ=America/New_York DRY_RUN=1 bash scripts/migrate-recordings.sh /srv/tapes/recordings
   TZ=America/New_York bash scripts/migrate-recordings.sh /srv/tapes/recordings
   ```

   The script requires Bash and GNU `date`. It renames old `YYYYMMDDHHMMSS.mp4` files to the fractional-second/offset format and removes matching old JPEG thumbnails. Already migrated names are left alone; unknown files and existing targets are skipped. Review all output. Files from before the **December 2025 MediaMTX timezone fix** may have been named in UTC; migrate those with `TZ=UTC`, separately if necessary. Ambiguous local times need manual verification. Anything not migrated **won't appear in the UI and is never deleted**.
6. `STORAGE_PATH`, `RETENTION_DAYS`, and generated thumbnails are gone. Remove the old variables and any recordings mount on tapes. Restart with `docker compose up -d` and verify playback and disk persistence.

## Development

The repository contains `api/` (Go), `ui/` (React/TypeScript), and `test/` (disposable integration stack). [CLAUDE.md](CLAUDE.md) covers architecture and development constraints; [API.md](API.md) documents the HTTP interface.

```bash
git clone https://github.com/vicgarcia/tapes.git
cd tapes
./test.sh        # UI build/lint/tests, Go vet/race tests, image build, integration checks
./test.sh ui     # or api / stack
```

Tests require Docker/Compose and run dependencies and builds in containers with disposable volumes, without installing dependencies into the checkout. In the Software Factory, use `factory-test [ui|api|stack]` instead; it holds the test lock and invokes `test.sh`.

`docker build -t tapes:local .` builds the production image: Node builds the UI, Go embeds `api/dist`, and Alpine supplies ffmpeg. To deploy that build, explicitly change the tapes image in Compose to `tapes:local`.

For interactive UI work, run the UI's `npm run dev` in a Node container with dependencies in a container volume. `TAPES_API_URL` selects the backend proxy target (default `http://localhost:8671`, relative to that container). Go needs `api/dist` present for its embed directive; build the UI first or use the test workflow's embed fixture. The UI uses hash routes, separate from server API paths.
