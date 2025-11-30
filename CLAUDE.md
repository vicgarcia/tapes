# Claude Development Context for Tapes

## Project Overview
Tapes is a production-ready security camera recording management system with a Go backend and React frontend. The system provides continuous recording playback with thumbnail generation and a responsive web interface.

## Current System Status (November 2025)

### ✅ PRODUCTION READY - FULLY IMPLEMENTED & DEPLOYED
- **Recordings-Only System**: Simplified architecture focused on continuous recording playback
- **Modular Go Architecture**: Refactored into internal packages for maintainability
- **Unified Video Processing**: Single processing pipeline for thumbnail generation
- **Docker Deployment**: OpenCV 4.12 compatible build with gocv integration
- **Background Processing**: Hourly thumbnail generation for all video files
- **Responsive UI**: Clean interface with mobile-first design, professional spacing
- **API Complete**: All endpoints active for authentication, cameras, and recordings
- **Authentication**: JWT with htpasswd integration
- **Video Processing**: OpenCV 4.12 thumbnail generation fully functional
- **Structured Logging**: Go slog with DEBUG env var, text format, all output to stdout

## Development Commands

### Build & Test
- `npm run dev` - start react development server (in ui/ directory)
- `npm run build` - build react production bundle
- `npm run lint` - run frontend linting
- `npm run typecheck` - run typescript checking
- `go run .` - start go development server (in api/ directory)
- `go fmt ./...` - format go code
- `go test ./...` - run go tests

### Docker Commands
- `docker build -t tapes .` - build production container (two-stage)
- `docker-compose up --build` - run with docker compose
- `docker-compose up -d` - run detached

### Key Commands to Run After Changes
Always run these commands after making changes:
1. `npm run lint` (for frontend changes)
2. `npm run typecheck` (for typescript changes)
3. `go fmt ./...` (for backend changes)

## Repository Structure

```
tapes/
├── api/                          # go backend (modular architecture)
│   ├── main.go                  # main application & routes
│   ├── internal/                # internal go packages (private)
│   │   ├── auth/                # authentication & jwt handling
│   │   │   └── auth.go          # htpasswd, jwt tokens, middleware
│   │   ├── cameras/             # camera management
│   │   │   └── cameras.go       # Camera struct, discovery, paths
│   │   ├── handlers/            # http request handlers
│   │   │   └── handlers.go      # all API endpoints
│   │   ├── logger/              # logging utilities
│   │   │   └── logger.go        # slog-based structured logging
│   │   └── media/               # video & thumbnail processing
│   │       ├── types.go         # Video, Recording structs
│   │       ├── recordings.go    # recording operations
│   │       ├── thumbnails.go    # thumbnail generation with OpenCV
│   │       └── processing.go    # video processing pipeline
│   ├── go.mod                   # go module definition
│   └── go.sum                   # go module checksums
├── ui/                          # react frontend
│   ├── src/components/
│   │   ├── Dashboard.tsx        # main interface
│   │   ├── CameraSelect.tsx     # camera selector
│   │   ├── DateSelect.tsx       # date selector
│   │   ├── VideoPlayer.tsx      # video playback component
│   │   └── Thumbnail.tsx        # thumbnail display component
│   ├── src/services/
│   │   ├── cameras.ts           # getRecordingsByDate() API
│   │   └── thumbnails.ts        # thumbnail fetching
│   └── src/types.ts             # typescript definitions
├── data/cameras/                # video storage
│   └── {camera}/                # 5-min continuous segments (*.mp4, *.jpg)
├── Dockerfile                   # two-stage build with OpenCV 4.12
├── docker-compose.yml           # production deployment with MediaMTX
├── mediamtx.yml                # MediaMTX configuration with recording
├── .env.template               # environment configuration template
├── README.md                   # project documentation
├── CLAUDE.md                   # this file - llm context
└── passwords                   # htpasswd authentication file
```

## Complete Implementation Status

### ✅ Backend Implementation (Go) - COMPLETE
- **Modular Architecture**: Clean separation into internal packages
- **API Endpoints**: All active in main.go using handlers package
  ```go
  r.HandleFunc("/cameras/{camera}/recordings", auth.ValidateAuth(handlers.RecordingsHandler)).Methods("GET")
  r.HandleFunc("/cameras/{camera}/recordings/{timestamp}/video", auth.ValidateAuth(handlers.RecordingVideoHandler)).Methods("GET")
  r.HandleFunc("/cameras/{camera}/recordings/{timestamp}/thumbnail", auth.ValidateAuth(handlers.RecordingThumbnailHandler)).Methods("GET")
  ```
- **Unified Processing**: ProcessAllVideos() handles thumbnail generation
- **Clean Separation**: Auth, cameras, handlers, and media logic properly separated
- **Background Processing**: Hourly thumbnail generation

### ✅ Frontend Implementation (React/TypeScript) - COMPLETE
- **Dashboard Component**: Main interface with camera and date selection
- **Professional Design**: Clean layout with mobile responsive controls
- **API Integration**: Service calls for recordings with proper date handling
- **Video Player**: H.264 video playback with error handling
- **Thumbnail Service**: Proper API integration for thumbnail display
- **Simplified UI**: Single-mode interface focused on continuous recordings

### ✅ Docker & Deployment - COMPLETE
- **OpenCV 4.12 Integration**: Uses gocv/opencv:4.12.0 builder for compatibility
- **Two-Stage Dockerfile**: Builder with Node.js/Go/OpenCV, minimal runtime
- **Docker Compose**: Production-ready with volume binding and environment config
- **Environment Template**: Comprehensive .env.template with all required variables
- **Security**: Non-root user, proper permissions, minimal attack surface

### ✅ Background Processing - FULLY FUNCTIONAL
- **Single Processing Pipeline**: ProcessAllVideos() handles all videos uniformly
- **Thumbnail Generation**: OpenCV processing creates thumbnails when missing
- **Smart File Handling**: Skips most recent file in each directory (actively recording)
- **Hourly Schedule**: Background task runs every hour
- **OpenCV Integration**: 500px thumbnail generation with gocv

## Key Files & Functions

### Critical Backend Files
- **`api/main.go`**: Main application with route registration and background processing
- **`api/internal/handlers/handlers.go`**: All HTTP handlers (auth, cameras, recordings)
- **`api/internal/auth/auth.go`**: JWT authentication, htpasswd, middleware
- **`api/internal/cameras/cameras.go`**: Camera struct, discovery, RecordingsPath()
- **`api/internal/logger/logger.go`**: Structured logging with slog (DEBUG env var)
- **`api/internal/media/processing.go`**: ProcessAllVideos() - unified video processing
- **`api/internal/media/thumbnails.go`**: GenerateThumbnail() - OpenCV thumbnail generation
- **`api/internal/media/recordings.go`**: GetRecordingsByDay(), GetRecordingPath()
- **`api/internal/media/types.go`**: Video and Recording type definitions

### Critical Frontend Files
- **`ui/src/components/Dashboard.tsx`**: Main interface with scroll restoration
- **`ui/src/services/cameras.ts`**: API service for recordings
- **`ui/src/components/VideoPlayer.tsx`**: Video player component
- **`ui/src/components/Thumbnail.tsx`**: Thumbnail component with anchor IDs
- **`ui/src/services/thumbnails.ts`**: Thumbnail service
- **`ui/src/types.ts`**: Type definitions

### Critical Configuration Files
- **`Dockerfile`**: Two-stage build with gocv/opencv:4.12.0 builder, debian runtime
- **`docker-compose.yml`**: Production deployment with MediaMTX and tapes services
- **`mediamtx.yml`**: MediaMTX configuration for RTSP proxy and recording
- **`.env.template`**: All environment variables documented

## API Endpoints

### Authentication
```
POST /login     # user authentication
POST /logout    # session termination
GET /auth       # validate current session
```

### Camera Management
```
GET /cameras    # list all available cameras
```

### Recordings
```
GET /cameras/{camera}/recordings?day=YYYY-MM-DD           # get recordings for date
GET /cameras/{camera}/recordings/{timestamp}/video        # stream recording video
GET /cameras/{camera}/recordings/{timestamp}/thumbnail    # get recording thumbnail
```

## Code Patterns to Follow

### Go Handler Pattern
```go
func RecordingsHandler(w http.ResponseWriter, r *http.Request) {
    // 1. extract path parameters using mux.Vars(r)
    // 2. log the request with structured logging
    logger.Info("recordings request", "camera", cameraName, "day", day, "remote_addr", r.RemoteAddr)
    // 3. get query parameters with r.URL.Query()
    // 4. call business logic function (GetRecordingsByDay, etc.)
    // 5. return json response with proper error handling
}
```

### Go Logging Pattern
```go
// Info level - always shown (key operations, requests, results)
logger.Info("starting http server", "port", 8671)
logger.Info("video request", "camera", cameraName, "timestamp", timestamp, "remote_addr", request.RemoteAddr)

// Error level - always shown (failures, errors)
logger.Error("invalid camera", "camera", cameraName, "error", err)
logger.Error("error generating thumbnail", "path", video.Path, "error", err)

// Debug level - only when DEBUG=true (detailed diagnostics)
logger.Debug("found recordings", "camera", cameraName, "day", day, "count", len(recordings))
logger.Debug("created thumbnail", "path", thumbnailPath)
```

### React Component Pattern (Target - Simplified)
```typescript
export type ComponentProps = {
    selected: Type
    setSelected: (value: Type) => void
}

export function Component({selected, setSelected}: ComponentProps) {
    return <div className="d-grid gap-3">
        <Form.Select className="p-2" value={selected} onChange={handler}>
            <option>Options</option>
        </Form.Select>
    </div>
}
```

### API Service Pattern
```typescript
export function getRecordingsByDate(camera: string, day: string) {
    return httpClient.get(`/cameras/${camera}/recordings`, {params: {day}})
        .then(response => response.data);
}
```

## File Structure Conventions

### Video File Patterns
- **Recordings**: `{YYYYMMDDHHMMSS}.mp4` (timestamp only)
- **Thumbnails**: Same name with `.jpg` extension

### Directory Structure
```
/cameras/
├── garage/
│   ├── 20250720143000.mp4       # continuous 5-minute video segments (fmp4 format)
│   ├── 20250720143000.jpg       # auto-generated thumbnail
│   └── ...
├── kitchen/                     # same structure
└── study/                       # same structure
```

Note: MediaMTX creates files directly in camera directories (no /recordings/ subdirectory)

## Environment Configuration

### Required Environment Variables
```env
# storage configuration
STORAGE_PATH=/cameras                                        # base path for camera directories
PASSWORDS_PATH=/opt/tapes/passwords                          # htpasswd file location

# jwt configuration
JWT_KEY=your-64-character-random-jwt-signing-key-here        # jwt signing secret
JWT_ISSUER=tapes-security-system                            # jwt issuer identifier

# logging configuration
DEBUG=false                                                  # debug logging (true, 1, or yes to enable)
                                                             # info and error messages always displayed
                                                             # all output goes to stdout (container logs)

# retention configuration
RETENTION_DAYS=90                                            # days to keep recordings (0 = keep forever, default: 90)
                                                             # NOTE: MediaMTX also has recordDeleteAfter in mediamtx.yml
```

### Docker Environment
- **Container Port**: 8671 (configurable)
- **Data Volume**: `./data/cameras:/cameras`
- **Passwords Volume**: `./passwords:/opt/tapes/passwords:ro`
- **Environment File**: `.env` loaded automatically

## MediaMTX Configuration

### Overview
MediaMTX is configured via `mediamtx.yml` to handle RTSP proxy and native recording. Key features:
- Built-in recording (no FFmpeg runOnReady needed)
- Fragmented MP4 (fmp4) format for crash resilience
- 5-minute segment duration
- 1-second part duration (RPO: max 1 second data loss on crash)
- Built-in retention management

### Key Configuration Settings

```yaml
pathDefaults:
  record: yes
  recordPath: /cameras/%path/%Y%m%d%H%M%S
  recordFormat: fmp4                    # fragmented MP4 for crash resilience
  recordPartDuration: 1s                # flush to disk every second
  recordSegmentDuration: 5m             # new file every 5 minutes
  recordDeleteAfter: 90d                # auto-delete after 90 days
  sourceProtocol: tcp                   # TCP for reliability

paths:
  kitchen:
    source: rtsp://admin:password@192.168.x.x:554/live/ch0
    sourceProtocol: tcp
```

### Recording Behavior
- **File Naming**: `YYYYMMDDHHMMSS.mp4` (e.g., `20251108143000.mp4`)
- **Directory**: Files created directly in `/cameras/{camera}/`
- **Format**: Fragmented MP4 (fmp4) - better than mpegts for crash recovery
- **Segment Duration**: 5 minutes (configurable)
- **Crash Recovery**: Max 1 second data loss due to 1s part duration
- **Retention**: Automatic deletion after 90 days (configurable)

### Adding Cameras
To add a new camera, add to the `paths` section in mediamtx.yml:
```yaml
paths:
  garage:
    source: rtsp://admin:password@192.168.x.x:554/stream
    sourceProtocol: tcp
```

The camera name in the path becomes the directory name under `/cameras/`.

### MediaMTX API
MediaMTX provides a monitoring API on `127.0.0.1:9997`:
- Monitor stream health
- Check recording status
- View connected clients

## Logging System

### Overview
The application uses Go's native `log/slog` package for structured logging:
- **Text Format**: Human-readable lowercase output
- **Stdout Only**: All logs go to stdout for container compatibility
- **Environment Control**: DEBUG env var enables debug-level logs
- **Structured Data**: Key-value pairs for easy parsing and filtering

### Log Levels

**Error** (always shown):
- Authentication failures
- File operation errors
- API query failures
- Thumbnail generation errors

**Info** (always shown):
- Server startup/shutdown events
- HTTP request logs (all API endpoints with remote_addr)
- Background processing status
- Video deletion operations
- Processing summaries with counts

**Debug** (only when DEBUG=true):
- Query result details (e.g., recording counts)
- Thumbnail creation paths
- Scheduled processing runs

### Implementation Details

The logger module (`api/internal/logger/logger.go`) initializes on import:
- Reads DEBUG env var (accepts: `true`, `1`, `yes`)
- Creates slog.TextHandler with lowercase formatter
- Sets global default logger for consistency
- All logging uses structured key-value pairs

### Example Output

Normal mode (DEBUG=false):
```
time=2025-11-09T15:30:00Z level=info msg="starting http server" port=8671
time=2025-11-09T15:30:05Z level=info msg="login attempt" username=admin remote_addr=192.168.1.100:54321
time=2025-11-09T15:30:07Z level=info msg="recordings request" camera=garage day=2025-11-09 remote_addr=192.168.1.100:54323
time=2025-11-09T15:30:10Z level=info msg="video processing complete" processed=150 created=5 deleted=2
```

Debug mode (DEBUG=true):
```
time=2025-11-09T15:30:07Z level=info msg="recordings request" camera=garage day=2025-11-09 remote_addr=192.168.1.100:54323
time=2025-11-09T15:30:07Z level=debug msg="found recordings" camera=garage day=2025-11-09 count=288
time=2025-11-09T15:30:08Z level=debug msg="created thumbnail" path=/cameras/garage/20251109143000.jpg
```

## Common Debugging

### Backend Issues
- Check environment variables are loaded (.env file in container)
- Enable debug logging with `DEBUG=true` for detailed diagnostics
- Review container logs: `docker logs tapes` or `docker-compose logs tapes`
- Verify camera directories exist with proper structure
- Check file permissions on video/thumbnail files
- Look for error-level logs for opencv, authentication, or file operation issues
- Test API endpoints directly with curl using jwt token

### Frontend Issues
- Run `npm run typecheck` for typescript errors
- Check browser developer tools for API call errors
- Verify token authentication in network tab
- Test camera and date selection

### Docker Issues
- Ensure `.env` file exists and is properly formatted
- Check volume mounts are correct (camera storage path and `~/tapes/passwords:/opt/tapes/passwords`)
- Verify pre-built image pulls successfully from ghcr.io
- Check container logs with `docker logs tapes`

### MediaMTX Issues
- Check MediaMTX container is running: `docker logs mediamtx`
- Verify camera RTSP URLs are accessible from container network
- Check recordings are being created in `/cameras/{camera}/`
- Monitor MediaMTX API: `curl http://localhost:9997/v3/paths/list`
- Verify file format is fmp4 (fragmented MP4)
- Check retention settings match between mediamtx.yml and .env

## Testing Strategy

### Manual Testing Checklist
1. **Authentication**: Login/logout functionality works
2. **Camera Selection**: All cameras appear and are selectable
3. **Date Selection**: Can browse different dates with data
4. **Video Playback**: Videos load and play correctly
5. **Thumbnails**: Generate correctly for all recordings
6. **API Response**: Endpoints return proper JSON data structure
7. **Docker**: Container builds and runs correctly

### API Testing Commands
```bash
# test recordings endpoint
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8671/cameras/garage/recordings?day=2025-11-02"

# test video serving
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8671/cameras/garage/recordings/20251102143000/video"

# test thumbnail serving
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8671/cameras/garage/recordings/20251102143000/thumbnail"
```

## Background Processing Details

### Current Implementation
The background processing generates thumbnails and manages retention for all video files:

```go
// api/internal/media/processing.go - processVideoFile() function
func processVideoFile(video VideoFile, currentTime time.Time, retentionDays int) (bool, bool) {
    // Delete videos older than retention period
    if daysAgo > retentionDays {
        deleteVideoAndThumbnail(video.Path, thumbnailPath)
        return false, true
    }

    // Delete empty video files
    if fileInfo.Size() == 0 {
        deleteVideoAndThumbnail(video.Path, thumbnailPath)
        return false, true
    }

    // Create thumbnail when none exists
    if !FileExists(thumbnailPath) {
        GenerateThumbnail(video.Path)
    }

    return true, false
}
```

### Background Tasks Schedule
- **Frequency**: Every hour via goroutine in main.go
- **Tasks**: ProcessAllVideos() called for thumbnail generation and cleanup
- **Thumbnail Generation**: Creates .jpg files for videos missing thumbnails
- **Retention Management**: Automatically deletes videos older than RETENTION_DAYS (default: 90 days)
- **Empty File Cleanup**: Removes zero-byte video files and their thumbnails
- **Configurable**: Set RETENTION_DAYS=0 to disable deletion and keep all recordings
- **Note**: MediaMTX also has built-in retention via recordDeleteAfter in mediamtx.yml

## Production Deployment

### Docker Deployment (Recommended)
```bash
# create installation directory
mkdir -p ~/tapes
cd ~/tapes

# download configuration files
curl -o docker-compose.yml https://raw.githubusercontent.com/vicgarcia/tapes/main/docker-compose.yml
curl -o .env.template https://raw.githubusercontent.com/vicgarcia/tapes/main/.env.template
curl -o mediamtx.yml https://raw.githubusercontent.com/vicgarcia/tapes/main/mediamtx.yml

# create environment file
cp .env.template .env
# edit .env with your settings (JWT_KEY, STORAGE_PATH, etc.)

# configure MediaMTX
# edit mediamtx.yml to add camera RTSP sources

# create directory structure for camera recordings
mkdir -p /path/to/cameras/{camera1,camera2,camera3}

# create htpasswd file
htpasswd -c passwords admin

# edit docker-compose.yml to update volume paths
# update camera storage path and passwords path in both mediamtx and tapes services

# run both MediaMTX and tapes (pulls pre-built image from ghcr.io)
docker-compose up -d

# verify services are running
docker-compose ps
docker logs mediamtx
docker logs tapes
```

### Local Development Build
For development purposes, clone the repository and build locally:
```bash
# clone repository
git clone https://github.com/vicgarcia/tapes.git
cd tapes

# build local docker image
docker build -t ghcr.io/vicgarcia/tapes:local .

# this creates a local image with the 'local' tag
# build takes 10-15 minutes due to OpenCV compilation
```

## Success Criteria

### Current System - Production Ready
1. ✅ Backend serves recordings-only endpoints
2. ✅ Authentication works with JWT and htpasswd
3. ✅ Video playback works for H.264 recordings
4. ✅ Thumbnails generate automatically with OpenCV
5. ✅ Background processing handles thumbnail creation hourly
6. ✅ Docker deployment ready with two-stage build
7. ✅ Automatic retention management with configurable retention period (default: 90 days)
8. ✅ Frontend simplified to single-mode recordings UI with scroll restoration
9. ✅ Clean URL structure with /recordings/ namespace for future expansion

## System Integration

### MediaMTX Recording System
MediaMTX handles all recording operations using built-in functionality:
- **RTSP Proxy**: Connects to camera RTSP streams on port 8554
- **Native Recording**: Uses built-in `record` feature (no FFmpeg runOnReady)
- **Format**: Fragmented MP4 (fmp4) for crash resilience
- **Segment Duration**: 5 minutes (configurable via recordSegmentDuration)
- **Part Duration**: 1 second flush to disk (RPO: max 1 second data loss)
- **Retention**: Built-in cleanup via recordDeleteAfter (default: 90 days)
- **Configuration**: All settings in mediamtx.yml

### File Management
- **Recording Path Pattern**: `/cameras/%path/%Y%m%d%H%M%S` (no /recordings/ subdirectory)
- **Thumbnails**: Generated by tapes backend using OpenCV/gocv
- **Cleanup**: Dual retention - MediaMTX and tapes both can delete old files

### External Dependencies
- **MediaMTX**: RTSP proxy with native recording (bluenviron/mediamtx:latest)
- **OpenCV**: Thumbnail generation via gocv (4.12.0)
- **Docker**: Containerized deployment with docker-compose

## Future Development Context

This system is designed for:
- **Production Deployment**: Docker-ready with security best practices
- **Scalability**: Easy addition of new cameras
- **Monitoring**: Background processing with logging
- **Security**: JWT authentication with htpasswd integration
- **Simplicity**: Focused on continuous recording playback

When implementing new features:
1. Maintain established patterns for consistency
2. Follow the recordings-only architecture
3. Ensure responsive design compatibility
4. Test both Docker and manual deployment scenarios
5. Keep the UI simple and focused on core functionality

## Recent Improvements (November 2025)

### MediaMTX Native Recording Migration - Complete
Migrated from FFmpeg-based recording to MediaMTX native recording:
- ✅ Removed `runOnReady` FFmpeg commands from configuration
- ✅ Now using MediaMTX built-in `record` feature
- ✅ Fragmented MP4 (fmp4) format for better crash resilience
- ✅ Reduced segment duration from 15 minutes to 5 minutes
- ✅ Added 1-second part duration for better crash recovery (RPO: 1s)
- ✅ Built-in retention management via `recordDeleteAfter`
- ✅ Comprehensive mediamtx.yml configuration with documentation
- ✅ Docker compose includes both MediaMTX and tapes services

This simplifies the recording pipeline and improves crash resilience.

### URL Structure Update - Complete
The URL structure has been updated to include `/recordings/` namespace:
- ✅ API routes updated to `/cameras/{camera}/recordings/...` pattern
- ✅ Frontend services updated to use new URL structure
- ✅ Filesystem structure remains simple (files directly in camera directories)
- ✅ Clean separation allows for future camera-level endpoints

This provides a clean API namespace while keeping the disk structure simple.

### Scroll Restoration Feature - Complete
Added scroll position restoration when navigating back from video player:
- ✅ Thumbnail components have anchor IDs based on timestamp
- ✅ Dashboard tracks which video was clicked
- ✅ Back button smoothly scrolls to previously viewed video position
- ✅ Works on both desktop and mobile layouts

### Structured Logging with slog - Complete
Migrated from legacy logger to Go's native slog package:
- ✅ Replaced custom logger with log/slog for structured logging
- ✅ Text format with lowercase levels for readability
- ✅ All output to stdout for container log compatibility
- ✅ DEBUG env var for enabling debug-level logs (accepts: true, 1, yes)
- ✅ Info-level request logging for all API endpoints
- ✅ Structured key-value pairs throughout (camera, timestamp, error, etc.)
- ✅ Error/Info always shown, Debug only when DEBUG=true
- ✅ Updated .env.template with DEBUG documentation

This provides production-ready logging with easy debugging and log aggregation support.
