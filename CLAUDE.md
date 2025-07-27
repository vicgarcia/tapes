# Claude Development Context for Tapes

## Project Overview
Tapes is a production-ready security camera recording and event management system with a Go backend and React frontend. The system provides complete dual-mode operation for continuous recordings and event-triggered captures with thumbnail generation and responsive web interface.

## Current System Status (July 2025)

### ✅ PRODUCTION READY - FULLY IMPLEMENTED & DEPLOYED
- **Complete Dual-Mode System**: Recordings + Events fully operational with proper slug handling
- **Modular Go Architecture**: Refactored into internal packages for maintainability
- **Unified Video Processing**: Single processing pipeline for all video types
- **Docker Deployment**: OpenCV 4.12 compatible build with gocv integration
- **Background Processing**: Full thumbnail generation enabled (no file deletion)
- **Responsive UI**: Clean header layout with mobile-first design, professional spacing
- **API Complete**: All endpoints active with correct event slug format (timestamp-eventtype)
- **Authentication**: JWT with htpasswd integration
- **Video Processing**: OpenCV 4.12 thumbnail generation fully restored and functional
- **Event Video Support**: Backend correctly serves MPEG-4 event videos (browser compatibility varies)

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
├── api/                          # go backend (refactored modular architecture)
│   ├── main.go                  # main application & routes (using internal packages)
│   ├── internal/                # internal go packages (private)
│   │   ├── auth/                # authentication & jwt handling
│   │   │   └── auth.go          # htpasswd, jwt tokens, middleware
│   │   ├── cameras/             # camera management
│   │   │   └── cameras.go       # Camera struct, discovery, paths
│   │   ├── handlers/            # http request handlers
│   │   │   └── handlers.go      # all API endpoints (auth, cameras, recordings, events)
│   │   └── media/               # video & thumbnail processing (modular)
│   │       ├── types.go         # Video, Recording, Event structs
│   │       ├── recordings.go    # recording-specific operations
│   │       ├── events.go        # event-specific operations
│   │       ├── thumbnails.go    # thumbnail generation with OpenCV
│   │       └── processing.go    # unified video processing pipeline
│   ├── go.mod                   # go module definition
│   └── go.sum                   # go module checksums
├── ui/                          # react frontend
│   ├── src/components/
│   │   ├── Dashboard.tsx        # main interface with 3-control layout
│   │   ├── TypeSelect.tsx       # recordings/events selector
│   │   ├── VideoPlayer.tsx      # enhanced with mediaType prop
│   │   └── Thumbnail.tsx        # enhanced with mediaType prop
│   ├── src/services/
│   │   ├── cameras.ts           # getRecordingsByDate() + getEventsByDate()
│   │   └── thumbnails.ts        # mediaType parameter support
│   └── src/types.ts             # typescript definitions (Video with optional event_type)
├── data/cameras/                # video storage
│   └── {camera}/
│       ├── recordings/          # 15-min continuous segments
│       └── events/              # event-triggered clips
├── Dockerfile                   # two-stage build with OpenCV 4.12 (gocv/opencv:4.12.0)
├── docker-compose.yml           # production deployment config
├── .env.template               # environment configuration template
├── README.md                   # project documentation
├── CLAUDE.md                   # this file - llm context
└── passwords                   # htpasswd authentication file
```

## Complete Implementation Status

### ✅ Backend Implementation (Go) - REFACTORED & COMPLETE
- **Modular Architecture**: Moved to internal packages (auth/, cameras/, handlers/, media/)
- **Events API Endpoints**: All active in main.go using handlers package
  ```go
  r.HandleFunc("/cameras/{camera}/events", auth.ValidateAuth(handlers.EventsHandler)).Methods("GET")
  r.HandleFunc("/cameras/{camera}/events/{slug}/video", auth.ValidateAuth(handlers.EventVideoHandler)).Methods("GET")
  r.HandleFunc("/cameras/{camera}/events/{slug}/thumbnail", auth.ValidateAuth(handlers.EventThumbnailHandler)).Methods("GET")
  ```
- **Unified Processing**: Single ProcessAllVideos() function handles all video types
- **Clean Separation**: Auth, cameras, handlers, and media logic properly separated
- **Background Processing**: Streamlined thumbnail generation (no file deletion)

### ✅ Frontend Implementation (React/TypeScript) - COMPLETE & POLISHED
- **TypeSelect Component**: recordings/events switcher following established patterns
- **Professional Dashboard**: clean header with logo left, controls right, mobile responsive
- **Mobile-First Design**: controls stack vertically on tablets/phones (md breakpoint)
- **API Integration**: separate service calls for recordings vs events with proper slug handling
- **Video Player**: enhanced with proper key prop, error handling, and bottom margin
- **Thumbnail Service**: correct slug format for events (timestamp-eventtype)
- **Event Video Handling**: proper frontend slug construction for backend compatibility
- **Type System**: enhanced Video type with optional event_type field
- **Responsive Layout**: seamless desktop/mobile experience with proper spacing

### ✅ Docker & Deployment - UPDATED & COMPLETE
- **OpenCV 4.12 Integration**: Uses gocv/opencv:4.12.0 builder for compatibility
- **Two-Stage Dockerfile**: Builder with Node.js/Go/OpenCV, minimal runtime with copied libraries
- **Docker Compose**: production-ready with volume binding and environment config
- **Environment Template**: comprehensive .env.template with all required variables
- **Security**: non-root user, proper permissions, minimal attack surface

### ✅ Background Processing - FULLY FUNCTIONAL & UNIFIED
- **Single Processing Pipeline**: ProcessAllVideos() handles all video types uniformly
- **Thumbnail Generation**: fully enabled OpenCV processing creates thumbnails when missing
- **File Deletion Removed**: no more 30-day retention or empty file cleanup
- **Smart File Handling**: Skips most recent file in each directory (actively recording)
- **Hourly Schedule**: background task runs every hour for thumbnail processing
- **OpenCV Integration**: thumbnails.go fully restored with gocv imports and 500px thumbnail generation

## Key Files & Functions

### Critical Backend Files (Refactored Architecture)
- **`api/main.go`**: main application with internal package imports and unified processing
- **`api/internal/handlers/handlers.go`**: all HTTP handlers (auth, cameras, recordings, events)
- **`api/internal/auth/auth.go`**: JWT authentication, htpasswd, middleware
- **`api/internal/cameras/cameras.go`**: Camera struct, discovery, path methods
- **`api/internal/media/processing.go`**: ProcessAllVideos() - unified video processing
- **`api/internal/media/thumbnails.go`**: GenerateThumbnail() - OpenCV thumbnail generation
- **`api/internal/media/recordings.go`**: recording-specific operations
- **`api/internal/media/events.go`**: event-specific operations with GetEventPath() for slug handling

### Critical Frontend Files
- **`ui/src/components/Dashboard.tsx`**: responsive interface with clean header and mobile layout
- **`ui/src/components/TypeSelect.tsx`**: recordings/events selector component
- **`ui/src/services/cameras.ts`**: getRecordingsByDate() and getEventsByDate() api calls
- **`ui/src/components/VideoPlayer.tsx`**: proper slug handling, key prop, error handling, bottom margin
- **`ui/src/components/Thumbnail.tsx`**: correct slug construction for events (timestamp-eventtype)

### Critical Configuration Files
- **`Dockerfile`**: two-stage build with gocv/opencv:4.12.0 builder, debian runtime
- **`docker-compose.yml`**: production deployment with volume binding
- **`.env.template`**: all environment variables documented

## API Endpoints (All Active)

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

### Recordings (Complete)
```
GET /cameras/{camera}/recordings?day=YYYY-MM-DD           # get recordings for date
GET /cameras/{camera}/recordings/{timestamp}/video        # stream recording video
GET /cameras/{camera}/recordings/{timestamp}/thumbnail    # get recording thumbnail
```

### Events (Complete)
```
GET /cameras/{camera}/events?day=YYYY-MM-DD              # get events for date
GET /cameras/{camera}/events/{slug}/video                # stream event video (slug = timestamp-eventtype)
GET /cameras/{camera}/events/{slug}/thumbnail            # get event thumbnail (slug = timestamp-eventtype)
```

## Code Patterns to Follow

### Go Handler Pattern
```go
func recordingsHandler(w http.ResponseWriter, r *http.Request) {
    // 1. extract path parameters using mux.Vars(r)
    // 2. get query parameters with r.URL.Query()
    // 3. call business logic function (getRecordingsByDay, etc.)
    // 4. return json response with proper error handling
}
```

### React Component Pattern
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
export function getDataByDate(camera: string, day: string) {
    return httpClient.get(`/cameras/${camera}/endpoint`, {params: {day}})
        .then(response => response.data);
}
```

## File Structure Conventions

### Video File Patterns
- **Recordings**: `{YYYYMMDDHHMMSS}.mp4` (timestamp only)
- **Events**: `{YYYYMMDDHHMMSS}-{eventtype}.mp4` (timestamp-eventtype)
- **Thumbnails**: same name with `.jpg` extension

### Directory Structure
```
/data/cameras/
├── garage/
│   ├── recordings/              # continuous 15-minute segments
│   │   ├── 20250720143000.mp4
│   │   ├── 20250720143000.jpg   # auto-generated thumbnail
│   │   └── ...
│   └── events/                  # event-triggered clips
│       ├── 20250720143045-motion.mp4
│       ├── 20250720143045-motion.jpg
│       └── ...
├── kitchen/ (same structure)
└── study/ (same structure)
```

## Environment Configuration

### Required Environment Variables
```env
# storage configuration
STORAGE_PATH=/data/cameras                                    # base path for camera directories
PASSWORDS_PATH=/opt/tapes/passwords                          # htpasswd file location

# jwt configuration  
JWT_KEY=your-64-character-random-jwt-signing-key-here        # jwt signing secret
JWT_ISSUER=tapes-security-system                            # jwt issuer identifier

# optional configuration
LOG_LEVEL=info                                               # logging level (debug, info, warn, error)
```

### Docker Environment
- **Container Port**: 8080 (mapped to host 8080)
- **Data Volume**: `./data/cameras:/data/cameras`
- **Passwords Volume**: `./passwords:/opt/tapes/passwords:ro`
- **Environment File**: `.env` loaded automatically

## Common Debugging

### Backend Issues
- check environment variables are loaded (.env file in container)
- verify camera directories exist with proper structure
- check file permissions on video/thumbnail files
- review logs for ffmpeg/opencv errors during thumbnail generation
- test api endpoints directly with curl using jwt token

### Frontend Issues
- run `npm run typecheck` for typescript errors
- check browser developer tools for api call errors  
- verify token authentication in network tab
- ensure mediaType prop is passed correctly to components
- test both recordings and events mode switching

### Docker Issues
- ensure `.env` file exists and is properly formatted
- check volume mounts are correct (`./data/cameras` and `./passwords`)
- verify docker build completes both stages successfully
- check container logs with `docker logs tapes`

## Testing Strategy

### Manual Testing Checklist
1. **Authentication**: login/logout functionality works
2. **Camera Selection**: all cameras appear and are selectable
3. **Date Selection**: can browse different dates with data
4. **Type Selection**: can switch between recordings/events modes
5. **Video Playback**: videos load and play correctly for both types
6. **Thumbnails**: generate correctly for both recordings and events
7. **API Response**: both endpoints return proper json data structure
8. **Docker**: container builds and runs correctly

### API Testing Commands
```bash
# test recordings endpoint
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8080/cameras/garage/recordings?day=2025-07-26"

# test events endpoint  
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8080/cameras/garage/events?day=2025-07-26"

# test video serving
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8080/cameras/garage/recordings/20250726143000/video"
  
# test thumbnail serving
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8080/cameras/garage/recordings/20250726143000/thumbnail"
```

## Background Processing Details

### Current Implementation (Modified July 2025)
The background processing has been modified to **ONLY generate thumbnails** and **NOT delete any files**:

```go
// api/media.go:187-208 - processVideo() function
func processVideo(videoPath string, currentTime time.Time) {
    // parse filename to timestamp
    // get thumbnail path
    // determine age of file (for logging purposes only)
    // create thumbnail when none exists
    if !fileExists(thumbnailPath) {
        generateThumbnail(videoPath)
    }
}

// api/media.go:325-337 - processEvent() function  
func processEvent(videoPath string, eventType string, currentTime time.Time) {
    // same pattern as processVideo but for events
    // only generates thumbnails, no file deletion
}
```

### Background Tasks Schedule
- **Frequency**: every hour via goroutine in main.go
- **Tasks**: processVideos() and processEvents() called sequentially
- **Function**: thumbnail generation for missing .jpg files
- **No Deletion**: empty files and old files are preserved

## Production Deployment

### Docker Deployment (Recommended)
```bash
# create environment file
cp .env.template .env
# edit .env with your settings

# create directory structure
mkdir -p data/cameras/{camera1,camera2,camera3}/{recordings,events}

# create htpasswd file
htpasswd -c passwords admin

# build and run
docker-compose up --build -d
```

### Manual Deployment
```bash
# build binary
go build -o tapes ./api

# create directories
mkdir -p /opt/tapes /data/cameras

# copy files
cp tapes /opt/tapes/
cp .env /opt/tapes/

# create systemd service (optional)
# run application
cd /opt/tapes && ./tapes
```

## Success Criteria for Features

### Current System (All ✅ Complete & Deployed)
1. ✅ three controls appear in clean header with proper spacing
2. ✅ type selector switches between "recordings" and "events"  
3. ✅ both modes load appropriate data from correct api endpoints with proper slug handling
4. ✅ video playback works for recordings (H.264), events served correctly (MPEG-4 browser dependent)
5. ✅ thumbnails generate automatically with full OpenCV functionality restored
6. ✅ background processing handles both recordings and events uniformly
7. ✅ mobile responsive design with stacked controls on tablets/phones
8. ✅ professional UI with proper spacing and clean layout
9. ✅ docker deployment ready with two-stage build and OpenCV 4.12
10. ✅ no file deletion - only thumbnail generation for family safety system

## System Integration

### FFmpeg Integration
- **Recording**: handled by mediamtx via rtsp streams
- **Thumbnails**: generated by opencv via gocv library
- **Format**: mp4 videos, jpg thumbnails

### External Dependencies
- **MediaMTX**: rtsp proxy and recording management
- **OpenCV**: thumbnail generation via gocv
- **FFmpeg**: video processing and streaming
- **Docker**: containerized deployment

## Future Development Context

This system is designed for:
- **Production Deployment**: docker-ready with security best practices
- **Scalability**: easy addition of new cameras and event types
- **AI Integration**: ready for ai-based event detection systems
- **Monitoring**: background processing with logging
- **Security**: jwt authentication with htpasswd integration

When implementing new features:
1. maintain established patterns for consistency
2. follow the dual-mode architecture for recordings vs events
3. use the three-control interface pattern
4. ensure responsive design compatibility
5. test both docker and manual deployment scenarios