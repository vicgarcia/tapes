# Claude Development Context for Tapes

## Project Overview
Tapes is a production-ready security camera recording and event management system with a Go backend and React frontend. The system provides complete dual-mode operation for continuous recordings and event-triggered captures with thumbnail generation and responsive web interface.

## Current System Status (July 2025)

### ✅ PRODUCTION READY - FULLY IMPLEMENTED
- **Complete Dual-Mode System**: Recordings + Events fully operational
- **Docker Deployment**: Two-stage build with production optimization
- **Background Processing**: Thumbnail generation only (file deletion removed)
- **Three-Control Interface**: Camera/Date/Type selector with responsive layout
- **API Complete**: All endpoints active and tested
- **Authentication**: JWT with htpasswd integration
- **Video Processing**: OpenCV thumbnail generation, FFmpeg integration

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
├── api/                          # go backend
│   ├── main.go                  # main application & routes (lines 53-55: events endpoints ACTIVE)
│   ├── handlers.go              # http handlers (eventsHandler, eventVideoHandler, eventThumbnailHandler)
│   ├── auth.go                  # jwt authentication
│   ├── media.go                 # video/thumbnail processing (lines 187-208, 325-337: processVideo/processEvent)
│   └── cameras.go               # camera management (consolidated)
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
├── Dockerfile                   # two-stage production build
├── docker-compose.yml           # production deployment config
├── .env.template               # environment configuration template
├── README.md                   # project documentation
├── CLAUDE.md                   # this file - llm context
└── passwords                   # htpasswd authentication file
```

## Complete Implementation Status

### ✅ Backend Implementation (Go) - COMPLETE
- **Events API Endpoints**: All active in main.go:53-55
  ```go
  r.HandleFunc("/cameras/{camera}/events", validateAuth(eventsHandler)).Methods("GET")
  r.HandleFunc("/cameras/{camera}/events/{slug}/video", validateAuth(eventVideoHandler)).Methods("GET")
  r.HandleFunc("/cameras/{camera}/events/{slug}/thumbnail", validateAuth(eventThumbnailHandler)).Methods("GET")
  ```
- **Event Handlers**: eventsHandler, eventVideoHandler, eventThumbnailHandler in handlers.go
- **Media Processing**: getEventsByDate, getEventPath, processEvent functions in media.go
- **Background Processing**: thumbnail generation for both recordings and events (no file deletion)
- **Camera Management**: consolidated Camera struct in api/cameras.go

### ✅ Frontend Implementation (React/TypeScript) - COMPLETE
- **TypeSelect Component**: recordings/events switcher following established patterns
- **Dashboard Layout**: three controls (camera, date, type) with responsive grid
- **API Integration**: separate service calls for recordings vs events
- **Video Player**: mediaType prop for correct URL generation
- **Thumbnail Service**: mediaType parameter for proper thumbnail URLs
- **Type System**: enhanced Video type with optional event_type field

### ✅ Docker & Deployment - COMPLETE
- **Two-Stage Dockerfile**: builder stage with node.js/go, minimal runtime stage
- **Docker Compose**: production-ready with volume binding and environment config
- **Environment Template**: comprehensive .env.template with all required variables
- **Security**: non-root user, proper permissions, minimal attack surface

### ✅ Background Processing - MODIFIED
- **Thumbnail Generation**: creates thumbnails when they don't exist (both recordings/events)
- **File Deletion Removed**: no more 30-day retention or empty file cleanup
- **Processing Functions**: processVideo() and processEvent() only generate thumbnails
- **Hourly Schedule**: background tasks run every hour for thumbnail processing

## Key Files & Functions

### Critical Backend Files
- **`api/main.go:53-55`**: events endpoints (ACTIVE AND WORKING)
- **`api/handlers.go:188-275`**: event handlers (eventsHandler, eventVideoHandler, eventThumbnailHandler) 
- **`api/media.go:187-208`**: processVideo() - recordings processing (thumbnail generation only)
- **`api/media.go:325-337`**: processEvent() - events processing (thumbnail generation only)
- **`api/cameras.go`**: Camera struct with RecordingsPath() and EventsPath() methods

### Critical Frontend Files
- **`ui/src/components/Dashboard.tsx`**: main interface with selectedType state and 3-control layout
- **`ui/src/components/TypeSelect.tsx`**: recordings/events selector component
- **`ui/src/services/cameras.ts`**: getRecordingsByDate() and getEventsByDate() api calls
- **`ui/src/components/VideoPlayer.tsx`**: mediaType prop for URL generation
- **`ui/src/components/Thumbnail.tsx`**: mediaType prop for thumbnail URLs

### Critical Configuration Files
- **`Dockerfile`**: two-stage build (lines 1-38: builder, 40-73: runtime)
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
GET /cameras/{camera}/events/{timestamp}/video           # stream event video  
GET /cameras/{camera}/events/{timestamp}/thumbnail       # get event thumbnail
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

### Current System (All ✅ Complete)
1. ✅ three controls appear in header: camera, date, type
2. ✅ type selector switches between "recordings" and "events"
3. ✅ both modes load appropriate data from correct api endpoints
4. ✅ video playback works for both recordings and events
5. ✅ thumbnails generate for both types automatically
6. ✅ background processing handles both recordings and events
7. ✅ all lint/typecheck commands pass
8. ✅ layout remains responsive on mobile devices
9. ✅ docker deployment ready with two-stage build
10. ✅ no file deletion - only thumbnail generation

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