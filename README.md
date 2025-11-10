# tapes - Home Security Camera Recording System

I've been tinkering with IP cameras at home for years. What started as a single camera monitoring the driveway turned into a multi-camera system, and with it came the realization that commercial solutions were either too expensive, too limited, or required subscriptions that felt unnecessary. I wanted something simple: capture video from my cameras continuously, store it efficiently, and make it available for whatever I needed—whether that was viewing in HomeKit, running AI detection, or just reviewing footage when the neighbor's cat set off the motion sensor again.

tapes is the result of that journey. It's built around a straightforward idea: use proven open-source tools to capture RTSP streams from IP cameras, save continuous recordings in manageable interval files, and provide a foundation for everything else. The recordings become source material for AI-based event detection, live viewing through HomeKit, or simply browsing through footage when you need to see what happened last Tuesday afternoon.

This isn't trying to be a complete commercial NVR replacement with every feature imaginable. Instead, it's a solid foundation that handles the core job well—continuous recording with a clean web interface—and stays out of your way when you want to build on top of it. The system has been running in production for months, quietly doing its job while I've refined the pieces that matter.

Recent improvements have simplified the architecture significantly: MediaMTX now handles recording natively using crash-resilient fragmented MP4 files, automatic retention management keeps disk usage in check, and structured logging makes debugging straightforward. The result is a cleaner, more reliable system that just works.

## Overview

tapes is built on three core components that work together:

- **MediaMTX**: Proxies your IP camera RTSP streams and handles native continuous recording (no FFmpeg needed)
- **tapes web application**: Go backend with React frontend for browsing and viewing recordings
- **Storage**: Simple file-based storage with automatic thumbnail generation and retention management

Everything runs in Docker containers orchestrated by docker-compose for easy deployment and management.

## What You Need

Before you begin, you'll need:

- A Linux server (Ubuntu/Debian recommended)
- Docker and docker-compose installed
- One or more IP cameras with RTSP streams
- Basic command line familiarity
- Camera stream URLs in format: `rtsp://user:password@ip:port/path`

## Setup and Install

### 1. Prepare the Filesystem

Create the directory structure for your camera recordings:

```bash
sudo mkdir -p /data/cameras/{garage,kitchen,study}
sudo chmod -R 755 /data/cameras
```

Replace `garage`, `kitchen`, and `study` with your actual camera names. The structure will look like:

```
/data/cameras/
├── garage/             # Video files go directly here
├── kitchen/
└── study/
```

MediaMTX will create video files directly in each camera directory—no subdirectories needed.

### 2. Clone the Repository

```bash
git clone https://github.com/vicgarcia/tapes.git
cd tapes
```

### 3. Configure Environment Variables

Create your environment configuration:

```bash
cp .env.template .env
nano .env
```

Edit the `.env` file with your settings:

```bash
# Required
JWT_KEY=your-secret-key-here              # Generate with: openssl rand -hex 32

# Optional (defaults shown)
STORAGE_PATH=/data/cameras                # Path to camera recordings
PASSWORDS_PATH=/opt/tapes/passwords       # Path to htpasswd file
JWT_ISSUER=tapes                          # JWT issuer identifier
DEBUG=false                               # Enable debug logging (true/false)
RETENTION_DAYS=90                         # Auto-delete after 90 days (0=keep forever)
```

**Important**: Generate a secure JWT_KEY with `openssl rand -hex 32` - don't use a simple password.

### 4. Create Authentication File

Create a password file for web interface access:

```bash
htpasswd -c passwords admin        # Create file with first user
htpasswd passwords viewer          # Add additional users
```

### 5. Configure MediaMTX

Edit the MediaMTX configuration at `mediamtx.yml`:

```yaml
paths:
  garage:
    source: rtsp://user:password@192.168.1.101:554/live/ch0
    sourceProtocol: tcp

  kitchen:
    source: rtsp://user:password@192.168.1.102:554/live/ch0
    sourceProtocol: tcp
```

That's it! MediaMTX handles recording automatically using the global defaults already configured in `mediamtx.yml`:

- **Native recording**: Built-in recording (no FFmpeg needed)
- **Format**: Fragmented MP4 (fmp4) - resilient to crashes
- **Segment duration**: 5-minute video files
- **Part duration**: 1-second disk flush (max 1s data loss on crash)
- **Retention**: Auto-delete after 90 days (configurable)
- **Filename format**: `YYYYMMDDHHMMSS.mp4` (e.g., `20251109143000.mp4`)

Simply add your camera's RTSP URL and MediaMTX handles the rest.

### 6. Start the System

Launch both MediaMTX and tapes with docker-compose:

```bash
docker-compose up -d
```

Check that everything is running:

```bash
docker-compose ps
docker-compose logs
```

The web application will be available at `http://your-server:8671`.

Verify recordings are being created by checking for video files in `/data/cameras/{camera}/`.

## Using tapes

Once running, open `http://your-server:8671` in your browser:

1. **Login** with credentials from your htpasswd file
2. **Select Camera** from the dropdown
3. **Choose Date** to browse recordings
4. **Click thumbnails** to play videos

The interface automatically generates thumbnails for all videos hourly. Recordings are played as native H.264 video in your browser. Videos are stored in 5-minute segments, making it easy to find exactly what you need.

## Production Deployment

### Storage Management

Monitor disk usage regularly:

```bash
df -h /data/cameras
```

With 5-minute segments, storage usage depends on your bitrate. Typical cameras at 2-4 Mbps use roughly:

- **Per camera**: 1-2 GB per day, 30-60 GB per month
- **Three cameras**: 3-6 GB per day, 90-180 GB per month

By default, tapes automatically deletes recordings older than 90 days. You can adjust this in `.env`:

```bash
RETENTION_DAYS=90    # Auto-delete after 90 days
RETENTION_DAYS=0     # Keep forever (disable auto-deletion)
```

Note that MediaMTX also has its own retention setting in `mediamtx.yml` (`recordDeleteAfter`). Both can run independently—set them to match for consistency.

### Reverse Proxy

For SSL and domain access, use nginx:

```nginx
server {
    listen 443 ssl;
    server_name cameras.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:8671;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Troubleshooting

### No video files appearing

Check MediaMTX container is running and recording:

```bash
docker-compose ps
docker-compose logs mediamtx
```

Verify camera URLs are correct and accessible from your server. Check that recordings are being created in `/data/cameras/{camera}/`.

### Thumbnails not generating

Check disk space and verify tapes has write permissions to camera directories. Thumbnails generate hourly automatically. Enable debug logging to see detailed thumbnail generation:

```bash
# In .env file
DEBUG=true
```

Then check logs: `docker-compose logs tapes`

### Can't login to web interface

Verify htpasswd file exists and contains users:

```bash
cat passwords
```

Check JWT_KEY is set in `.env` file and is a secure random key (not a simple password).

### Enable debug logging

For detailed diagnostics, enable debug mode in `.env`:

```bash
DEBUG=true
```

This shows all request details, thumbnail generation, and processing information in the logs.

## Architecture Details

### File Naming Convention

- **Recordings**: `YYYYMMDDHHMMSS.mp4` (timestamp when segment started)
- **Thumbnails**: `.jpg` files with matching names

### API Endpoints

All endpoints require JWT authentication:

- `POST /login` - Authenticate with htpasswd credentials
- `GET /cameras` - List available cameras
- `GET /cameras/{camera}/recordings?day=YYYY-MM-DD` - Get recordings for date
- `GET /cameras/{camera}/recordings/{timestamp}/video` - Stream recording
- `GET /cameras/{camera}/recordings/{timestamp}/thumbnail` - Get thumbnail

### Background Processing

tapes runs an hourly background task that:

- Scans all camera directories for video files
- Generates thumbnails for any videos missing them using OpenCV
- Skips the most recent file (may still be recording)
- Deletes videos older than RETENTION_DAYS (default: 90 days)
- Removes zero-byte files (corrupted recordings)

All processing is logged with structured output for easy monitoring.

## Contributing

See `CLAUDE.md` for development guidelines and architecture decisions.

### Development

```bash
# Frontend development
cd ui && npm run dev

# Backend development
cd api && go run .

# Code formatting
npm run lint && go fmt ./...
```

## License

[License to be determined]
