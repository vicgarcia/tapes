package media

import (
	"log"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/vicgarcia/tapes/internal/cameras"
)

// VideoFile represents any video file in the system with its metadata
type VideoFile struct {
	Path      string
	Directory string // "recordings" or "events"
	Camera    string
	Filename  string
}

// GetAllVideoFiles discovers all video files across all cameras and directories
func GetAllVideoFiles() ([]VideoFile, error) {
	cameras, err := cameras.GetAll()
	if err != nil {
		return nil, err
	}

	var allVideos []VideoFile

	for _, camera := range cameras {
		// Get videos from recordings directory
		pattern := filepath.Join(camera.RecordingsPath(), "*.mp4")
		files, err := filepath.Glob(pattern)
		if err != nil {
			log.Printf("error getting recordings for camera %s: %v", camera.Name, err)
		} else {
			sort.Strings(files)
			// Skip last file, likely to be actively being written to
			if len(files) > 0 {
				files = files[:len(files)-1]
			}
			for _, file := range files {
				allVideos = append(allVideos, VideoFile{
					Path:      file,
					Directory: "recordings",
					Camera:    camera.Name,
					Filename:  filepath.Base(file),
				})
			}
		}

		// Get videos from events directory
		pattern = filepath.Join(camera.EventsPath(), "*.mp4")
		files, err = filepath.Glob(pattern)
		if err != nil {
			log.Printf("error getting events for camera %s: %v", camera.Name, err)
		} else {
			sort.Strings(files)
			// Skip last file, likely to be actively being written to
			if len(files) > 0 {
				files = files[:len(files)-1]
			}
			for _, file := range files {
				allVideos = append(allVideos, VideoFile{
					Path:      file,
					Directory: "events",
					Camera:    camera.Name,
					Filename:  filepath.Base(file),
				})
			}
		}
	}

	// Sort by path to ensure consistent processing order
	sort.Slice(allVideos, func(i, j int) bool {
		return allVideos[i].Path < allVideos[j].Path
	})

	return allVideos, nil
}

// ProcessAllVideos is the main processing function that handles all video files
func ProcessAllVideos() {
	log.Println("Starting video processing for thumbnail generation")

	videos, err := GetAllVideoFiles()
	if err != nil {
		log.Printf("error getting video files: %v", err)
		return
	}

	processedCount := 0
	createdCount := 0
	currentTime := time.Now()

	for _, video := range videos {
		if processVideoFile(video, currentTime) {
			createdCount++
		}
		processedCount++
	}

	log.Printf("Video processing complete: processed %d videos, created %d thumbnails",
		processedCount, createdCount)
}

// processVideoFile processes a single video file for thumbnail generation
func processVideoFile(video VideoFile, currentTime time.Time) bool {
	// Get the thumbnail path by replacing .mp4 with .jpg
	thumbnailPath := GetThumbnailPath(video.Path)

	// Check if thumbnail already exists
	if FileExists(thumbnailPath) {
		return false // No thumbnail created
	}

	// Parse filename for logging (optional, for age tracking)
	filename := strings.TrimSuffix(video.Filename, filepath.Ext(video.Filename))
	timestampPart := filename
	if strings.Contains(filename, "-") {
		timestampPart = strings.Split(filename, "-")[0]
	}

	if len(timestampPart) >= 8 {
		if parsedDate, err := time.Parse("20060102", timestampPart[:8]); err == nil {
			diff := currentTime.Sub(parsedDate)
			daysAgo := int(diff.Hours() / 24)
			log.Printf("Creating thumbnail for %s/%s (video is %d days old)",
				video.Camera, video.Filename, daysAgo)
		}
	}

	// Generate thumbnail
	_, err := GenerateThumbnail(video.Path)
	if err != nil {
		log.Printf("error generating thumbnail for %s: %v", video.Path, err)
		return false
	}

	log.Printf("Created thumbnail: %s", thumbnailPath)
	return true // Thumbnail created
}
