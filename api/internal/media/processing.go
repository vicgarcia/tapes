package media

import (
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/vicgarcia/tapes/internal/cameras"
	"github.com/vicgarcia/tapes/internal/env"
)

// VideoFile represents any video file in the system with its metadata
type VideoFile struct {
	Path     string
	Camera   string
	Filename string
}

// GetAllVideoFiles discovers all video files across all cameras and directories
func GetAllVideoFiles() ([]VideoFile, error) {
	cameras, err := cameras.GetAll()
	if err != nil {
		return nil, err
	}

	var allVideos []VideoFile

	for _, camera := range cameras {
		// Get videos from camera directory
		pattern := filepath.Join(camera.Path, "*.mp4")
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
					Path:     file,
					Camera:   camera.Name,
					Filename: filepath.Base(file),
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
	log.Println("Starting video processing for thumbnail generation and cleanup")

	videos, err := GetAllVideoFiles()
	if err != nil {
		log.Printf("error getting video files: %v", err)
		return
	}

	// Get retention days from environment (default: 90 days)
	retentionDays := env.GetInt("RETENTION_DAYS", 90)

	processedCount := 0
	createdCount := 0
	deletedCount := 0
	currentTime := time.Now()

	for _, video := range videos {
		created, deleted := processVideoFile(video, currentTime, retentionDays)
		if created {
			createdCount++
		}
		if deleted {
			deletedCount++
		}
		processedCount++
	}

	log.Printf("Video processing complete: processed %d videos, created %d thumbnails, deleted %d videos",
		processedCount, createdCount, deletedCount)
}

// processVideoFile processes a single video file for thumbnail generation and cleanup
// Returns (thumbnailCreated, videoDeleted)
func processVideoFile(video VideoFile, currentTime time.Time, retentionDays int) (bool, bool) {
	thumbnailPath := GetThumbnailPath(video.Path)

	// Parse filename to get date
	filename := strings.TrimSuffix(video.Filename, filepath.Ext(video.Filename))
	timestampPart := filename
	if strings.Contains(filename, "-") {
		timestampPart = strings.Split(filename, "-")[0]
	}

	// Check if video should be deleted
	if len(timestampPart) >= 8 {
		if parsedDate, err := time.Parse("20060102", timestampPart[:8]); err == nil {
			diff := currentTime.Sub(parsedDate)
			daysAgo := int(diff.Hours() / 24)

			// Delete video if older than retention period (only if retention is enabled)
			if retentionDays > 0 && daysAgo > retentionDays {
				log.Printf("Deleting old video %s/%s (%d days old, retention: %d days)",
					video.Camera, video.Filename, daysAgo, retentionDays)
				deleteVideoAndThumbnail(video.Path, thumbnailPath)
				return false, true
			}

			// Check if video file is empty and delete if so
			if fileInfo, err := os.Stat(video.Path); err == nil && fileInfo.Size() == 0 {
				log.Printf("Deleting empty video %s/%s", video.Camera, video.Filename)
				deleteVideoAndThumbnail(video.Path, thumbnailPath)
				return false, true
			}
		}
	}

	// Create thumbnail if it doesn't exist
	if !FileExists(thumbnailPath) {
		// Generate thumbnail
		_, err := GenerateThumbnail(video.Path)
		if err != nil {
			log.Printf("error generating thumbnail for %s: %v", video.Path, err)
			return false, false
		}

		log.Printf("Created thumbnail: %s", thumbnailPath)
		return true, false
	}

	return false, false
}

// deleteVideoAndThumbnail removes both the video file and its associated thumbnail
func deleteVideoAndThumbnail(videoPath, thumbnailPath string) {
	// Delete thumbnail if it exists
	if FileExists(thumbnailPath) {
		if err := os.Remove(thumbnailPath); err != nil {
			log.Printf("error deleting thumbnail %s: %v", thumbnailPath, err)
		}
	}

	// Delete video file
	if err := os.Remove(videoPath); err != nil {
		log.Printf("error deleting video %s: %v", videoPath, err)
	}
}
