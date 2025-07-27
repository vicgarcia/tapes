package media

import (
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/vicgarcia/tapes/internal/cameras"
)

// GetEventsByDay returns events for a specific camera and day
func GetEventsByDay(camera cameras.Camera, day string) ([]Event, error) {
	dayQuery := strings.Replace(day, "-", "", -1)
	files, err := filepath.Glob(filepath.Join(camera.EventsPath(), dayQuery+"*.mp4"))
	if err != nil {
		return nil, err
	}

	if len(files) > 0 {
		sort.Strings(files)
		now := time.Now()
		currentDay := now.Format("20060102")
		// do not include the most recent video (it's being recorded)
		if dayQuery == currentDay {
			files = files[:len(files)-1]
		}
	}

	events := make([]Event, 0)
	for _, file := range files {
		filename := strings.TrimSuffix(filepath.Base(file), filepath.Ext(file))
		parts := strings.SplitN(filename, "-", 2)
		if len(parts) < 2 {
			continue // Skip files not matching the expected format
		}
		timestamp := parts[0]
		eventType := parts[1]
		events = append(events, Event{File: file, Timestamp: timestamp, Type: eventType})
	}

	return events, nil
}

// GetEventPath returns the path to an event file by camera and timestamp
func GetEventPath(camera cameras.Camera, timestamp string) string {
	// Events have format: timestamp-eventtype.mp4, but we need to find the actual file
	pattern := filepath.Join(camera.EventsPath(), timestamp+"-*.mp4")
	files, err := filepath.Glob(pattern)
	if err != nil || len(files) == 0 {
		return ""
	}
	return files[0] // Return first match
}
