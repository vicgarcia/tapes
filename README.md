# Tapes - Security Camera Recording & Event Management System

Tapes is a production-ready web application for viewing and managing security camera recordings and events. Built with a Go backend and React frontend, it provides complete dual-mode operation for continuous recordings and event-triggered captures with Docker deployment.

## Current Status

### ✅ Production Ready & Refactored (July 2025)
- **Complete Dual-Mode System**: recordings + events fully operational
- **Modular Go Architecture**: refactored into internal packages for maintainability
- **Unified Video Processing**: single processing pipeline for all video types
- **Docker Deployment**: OpenCV 4.12 compatible build with gocv integration
- **Three-Control Interface**: camera/date/type selector with responsive layout
- **Background Processing**: streamlined thumbnail generation (no file deletion)
- **API Complete**: all endpoints active and tested
- **Authentication**: JWT with htpasswd integration

## Features

- **Dual Mode Operation**: seamless switching between continuous recordings and event-triggered captures
- **Multi-Camera Support**: view recordings/events from multiple cameras with easy selection
- **Date-Based Navigation**: browse historical footage by date with thumbnail previews
- **Automatic Thumbnail Generation**: background processing creates thumbnails for all videos
- **Event Classification**: events categorized by type (motion, person, vehicle, etc.)
- **Responsive UI**: modern React interface with Bootstrap styling optimized for mobile
- **JWT Authentication**: secure access with htpasswd-based user management
- **Docker Ready**: production containerization with security best practices

## Architecture

### Recording vs Events
- **Recordings**: continuous 15-minute MP4 segments captured via FFmpeg (format: `YYYYMMDDHHMMSS.mp4`)
- **Events**: motion/AI-triggered shorter clips with classification (format: `YYYYMMDDHHMMSS-eventtype.mp4`)
- **Unified Interface**: single UI to browse both types with seamless mode switching
- **Thumbnail Generation**: automatic .jpg creation for all video files

### Tech Stack  
- **Backend**: Go 1.22 with modular internal package architecture
- **Frontend**: React 18 with TypeScript and Bootstrap 5
- **Video Processing**: FFmpeg + OpenCV 4.12 (GoCV) for thumbnail generation
- **Streaming**: MediaMTX for RTSP proxy and process management
- **Deployment**: Docker with gocv/opencv:4.12.0 builder, Debian runtime
- **Storage**: file-based with unified video processing pipeline

## System Dependencies

This application integrates with several components to provide a complete security camera solution:

### FFmpeg
FFmpeg handles video capture and processing.

Install ffmpeg:
```bash
sudo apt install ffmpeg
```

### MediaMTX
MediaMTX proxies RTSP streams and manages recording processes.

Install MediaMTX:
```bash
sudo su
mkdir /opt/mediamtx
wget https://github.com/bluenviron/mediamtx/releases/download/v1.11.3/mediamtx_v1.11.3_linux_amd64.tar.gz
tar -xzf mediamtx_v1.11.3_linux_amd64.tar.gz
exit
```

**Configuration Example** (mediamtx.yml):
```yaml
  garage:
    source: rtsp://user:password@192.168.100.101:554/live/ch0
    runOnReady: ffmpeg -loglevel error -i rtsp://localhost:8554/garage -c copy -f segment -segment_format mp4 -segment_time 900 -segment_atclocktime 1 -reset_timestamps 1 -strftime 1 /data/cameras/garage/recordings/%Y%m%d%H%M%S.mp4
    runOnReadyRestart: yes
  
  kitchen:
    source: rtsp://user:password@192.168.100.102:554/live/ch0
    runOnReady: ffmpeg -loglevel error -i rtsp://localhost:8554/kitchen -c copy -f segment -segment_format mp4 -segment_time 900 -segment_atclocktime 1 -reset_timestamps 1 -strftime 1 /data/cameras/kitchen/recordings/%Y%m%d%H%M%S.mp4
    runOnReadyRestart: yes
```

*Note: Recordings are captured in 15-minute (900 second) segments for optimal storage and playback.*

### HomeKit Integration
HomeBridge exposes cameras for real-time viewing in Apple HomeKit.

Install Homebridge:
```bash
cd /tmp
curl -sSfL https://repo.homebridge.io/KEY.gpg | sudo gpg --dearmor | sudo tee /usr/share/keyrings/homebridge.gpg > /dev/null
echo "deb [signed-by=/usr/share/keyrings/homebridge.gpg] https://repo.homebridge.io stable main" | sudo tee /etc/apt/sources.list.d/homebridge.list > /dev/null
sudo apt update
sudo apt install homebridge
```

Setup via UI at http://server-ip:8581 and install "Homebridge Camera FFmpeg" plugin.

**Camera Configuration**:
```json
{
  "name": "garage",
  "videoConfig": {
    "source": "-i rtsp://localhost:8554/garage"
  }
}
```

### OpenCV (GoCV)
Required for thumbnail generation and video processing.

**Docker Deployment**: OpenCV 4.12 is automatically included via the `gocv/opencv:4.12.0` builder image.

**Manual Installation** (OpenCV 4.12):
```bash
sudo su
mkdir /opt/gocv
cd /opt/gocv

wget -O opencv.zip https://github.com/opencv/opencv/archive/4.12.0.zip
unzip opencv.zip
mkdir build
cd build
cmake -D HAVE_FFMPEG=ON -D OPENCV_GENERATE_PKGCONFIG=YES ../opencv-4.12.0
cmake --build .
make install
```

*Note: Docker deployment is recommended as it eliminates OpenCV version compatibility issues.*

## Quick Start (Docker - Recommended)

### 1. Clone Repository
```bash
git clone git@github.com:vicgarcia/tapes.git
cd tapes
```

### 2. Setup Environment
```bash
# create environment file from template
cp .env.template .env

# edit .env with your settings (minimum: JWT_KEY)
nano .env
```

### 3. Create Directory Structure
```bash
# create camera directories
mkdir -p data/cameras/{garage,kitchen,study}/{recordings,events}

# create htpasswd file for authentication
htpasswd -c passwords admin
```

### 4. Deploy with Docker
```bash
# build and run with docker compose
docker-compose up --build -d

# check logs
docker logs tapes
```

The application will be available at **http://localhost:8080**

### 5. Add Video Files
Place video files in the appropriate directories:
- **Recordings**: `data/cameras/{camera}/recordings/YYYYMMDDHHMMSS.mp4`
- **Events**: `data/cameras/{camera}/events/YYYYMMDDHHMMSS-eventtype.mp4`

Thumbnails will be automatically generated on the next hourly background process.

## Manual Installation (Advanced)

For non-Docker deployment, you'll need to install dependencies and build manually:

### Dependencies
```bash
sudo apt install apache2-utils ffmpeg
# install go 1.22, node.js 23, opencv 4.10 (see system dependencies section)
```

### Build & Deploy
```bash
# build frontend
cd ui && npm install && npm run build

# build backend  
cd api && go build -o tapes .

# create directories and copy files
sudo mkdir -p /opt/tapes /data/cameras
sudo cp tapes /opt/tapes/
sudo cp .env /opt/tapes/

# run application
cd /opt/tapes && ./tapes
```

The application will be available at **http://localhost:8080**

## File Structure

```
/data/cameras/
├── garage/
│   ├── recordings/     # Continuous 15-minute segments
│   │   ├── 20250720143000.mp4
│   │   ├── 20250720143000.jpg  (thumbnail)
│   │   └── ...
│   └── events/         # Event-triggered clips
│       ├── 20250720143045-motion.mp4
│       ├── 20250720143045-motion.jpg
│       └── ...
├── kitchen/
│   ├── recordings/
│   └── events/
└── study/
    ├── recordings/
    └── events/
```

## API Endpoints

All endpoints require JWT authentication via `Authorization: Bearer <token>` header.

### Authentication
- `POST /login` - user authentication with htpasswd credentials
- `POST /logout` - session termination
- `GET /auth` - validate current session

### Camera Management  
- `GET /cameras` - list all available cameras

### Recordings (Complete)
- `GET /cameras/{camera}/recordings?day=YYYY-MM-DD` - get recordings for date
- `GET /cameras/{camera}/recordings/{timestamp}/video` - stream recording video
- `GET /cameras/{camera}/recordings/{timestamp}/thumbnail` - get recording thumbnail

### Events (Complete)
- `GET /cameras/{camera}/events?day=YYYY-MM-DD` - get events for date
- `GET /cameras/{camera}/events/{slug}/video` - stream event video (slug = timestamp-eventtype)
- `GET /cameras/{camera}/events/{slug}/thumbnail` - get event thumbnail (slug = timestamp-eventtype)

### Frontend Interface

The React frontend provides a clean, responsive interface:
- **Three-Control Header**: Camera, Date, and Type selectors on desktop
- **Mobile Responsive**: Controls stack vertically on tablets/phones
- **Type Switching**: seamless switching between "RECORDINGS" and "EVENTS" modes
- **Video Codec Support**: Recordings (H.264) play natively, Events (MPEG-4) may require browser support
- **Thumbnail Grid**: automatic thumbnail generation and display
- **Professional Design**: clean header layout with proper spacing and mobile optimization

All video playback and thumbnail display automatically adapts based on the selected mode.

## Development

### Frontend Development
```bash
cd ui
npm install
npm run dev  # Development server
npm run build  # Production build
```

### Backend Development
```bash
cd api
go mod tidy
go run .
```

### Build & Test Commands
- `npm run lint` - Frontend linting
- `npm run typecheck` - TypeScript checking
- `go fmt ./...` - Go code formatting
- `go test ./...` - Run Go tests

## Background Processing

The application runs a unified hourly background task to:
- **Generate thumbnails** for all video files that don't have them
- **Process recordings and events** through single pipeline
- **Smart file handling** - skips most recent file (actively recording)
- **No file deletion** - all videos are preserved indefinitely

### Processing Details
- **Frequency**: every hour via background goroutine
- **Function**: ProcessAllVideos() scans all camera directories uniformly
- **Action**: creates .jpg thumbnails using OpenCV 4.12 when missing
- **Architecture**: unified processing eliminates code duplication
- **File preservation**: no deletion of empty files or old videos (removed July 2025)

## Event Processing

Events are processed with the following logic:
- **File naming**: `{timestamp}-{event_type}.mp4` format (e.g., `20250726143045-motion.mp4`)
- **Thumbnail generation**: same automatic processing as recordings
- **Event types**: motion, person, vehicle, package, etc. (determined by filename)
- **No retention policy**: all event files are preserved indefinitely

## Production Deployment

### Docker Production (Recommended)
The included Docker setup provides production-ready deployment:
- **Two-stage build**: optimized container size with minimal runtime
- **Security**: non-root user, proper permissions
- **Environment**: configurable via .env file
- **Volumes**: persistent data and authentication files
- **Health checks**: automatic container monitoring

### Additional Production Considerations
- **Reverse proxy**: use nginx for SSL/domain handling
- **Storage monitoring**: implement capacity alerting for video directories
- **Log management**: configure log rotation and centralized logging
- **Backup strategy**: regular backup of htpasswd and configuration files
- **Performance**: monitor container resources and scale if needed

## Contributing

This project follows standard Go and React development practices. See `CLAUDE.md` for comprehensive development context and LLM-assisted development guidelines.

### Development Setup
```bash
# frontend development
cd ui && npm run dev

# backend development  
cd api && go run .

# code formatting
npm run lint && npm run typecheck && go fmt ./...
```

## License

[License information to be added]