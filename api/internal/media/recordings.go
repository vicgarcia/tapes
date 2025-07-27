package media

import (
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/vicgarcia/tapes/internal/cameras"
)

// GetRecordingsByDay returns recordings for a specific camera and day
func GetRecordingsByDay(camera cameras.Camera, day string) ([]Recording, error) {
	dayQuery := strings.Replace(day, "-", "", -1)
	files, err := filepath.Glob(filepath.Join(camera.RecordingsPath(), dayQuery+"*.mp4"))
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

	videos := make([]Recording, 0)
	for _, file := range files {
		timestamp := strings.TrimSuffix(filepath.Base(file), filepath.Ext(file))
		videos = append(videos, Recording{File: file, Timestamp: timestamp})
	}

	return videos, nil
}

// GetRecordingPath returns the path to a recording file by camera and timestamp
func GetRecordingPath(camera cameras.Camera, timestamp string) string {
	recordingPath := filepath.Join(camera.RecordingsPath(), timestamp+".mp4")
	return recordingPath
}
