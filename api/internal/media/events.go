package media

import (
	"fmt"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/vicgarcia/tapes/internal/cameras"
	"github.com/vicgarcia/tapes/internal/logger"
)

// GetEventsByDay returns events for a specific camera and day
func GetEventsByDay(camera cameras.Camera, day string) ([]Event, error) {
	dayQuery := strings.Replace(day, "-", "", -1)
	pattern := filepath.Join(camera.EventsPath(), dayQuery+"*.mp4")

	logger.Debug(fmt.Sprintf("searching for events with pattern: %s", pattern))

	files, err := filepath.Glob(pattern)
	if err != nil {
		logger.Error(fmt.Sprintf("glob error for pattern %s: %v", pattern, err))
		return nil, err
	}

	logger.Debug(fmt.Sprintf("found %d event files before filtering", len(files)))

	if len(files) > 0 {
		sort.Strings(files)
		now := time.Now()
		currentDay := now.Format("20060102")
		// do not include the most recent video (it's being recorded)
		if dayQuery == currentDay {
			logger.Debug(fmt.Sprintf("filtering out most recent file for current day %s", currentDay))
			files = files[:len(files)-1]
		}
	}

	logger.Debug(fmt.Sprintf("%d event files after filtering", len(files)))

	events := make([]Event, 0)
	for _, file := range files {
		filename := strings.TrimSuffix(filepath.Base(file), filepath.Ext(file))
		logger.Debug(fmt.Sprintf("processing event file: %s", filename))

		parts := strings.SplitN(filename, "-", 2)
		if len(parts) < 2 {
			logger.Debug(fmt.Sprintf("skipping file %s - doesn't match expected format", filename))
			continue // Skip files not matching the expected format
		}
		timestamp := parts[0]
		eventType := parts[1]
		logger.Debug(fmt.Sprintf("parsed event: timestamp=%s, type=%s", timestamp, eventType))
		events = append(events, Event{File: file, Timestamp: timestamp, Type: eventType})
	}

	logger.Debug(fmt.Sprintf("returning %d events", len(events)))
	return events, nil
}

// GetEventPath returns the path to an event file by camera and full slug
func GetEventPath(camera cameras.Camera, slug string) string {
	// The slug is the full filename without extension (timestamp-eventtype)
	eventPath := filepath.Join(camera.EventsPath(), slug+".mp4")
	if FileExists(eventPath) {
		return eventPath
	}
	return ""
}
