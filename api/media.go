package main

import (
	"errors"
	"fmt"
	"image"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"gocv.io/x/gocv"
)

// camera object

type Camera struct {
	Path string `json:"-"`
	Name string `json:"name"`
}

func (c Camera) RecordingsPath() string {
	return filepath.Join(c.Path, "recordings")
}

func (c Camera) EventsPath() string {
	return filepath.Join(c.Path, "events")
}

// video base object

type Video struct {
	File      string `json:"-"`
	Timestamp string `json:"timestamp"`
}

// recording object extending video

type Recording struct {
	File      string `json:"-"`
	Timestamp string `json:"timestamp"`
}

// event object extending video with additional type field

type Event struct {
	File      string `json:"-"`
	Timestamp string `json:"timestamp"`
	Type      string `json:"event_type"`
}

// get path to saved recording files from env var

func getStoragePath() (string, error) {
	storagePath := os.Getenv("STORAGE_PATH")
	if storagePath == "" {
		return "", fmt.Errorf("missing STORAGE_PATH environment variable")
	}

	return storagePath, nil
}

// get a list of camera objects from video path folders

func getCameras() ([]Camera, error) {
	storagePath, err := getStoragePath()
	// fmt.Printf("got storage path %s", storagePath)
	if err != nil {
		return nil, err
	}

	dirs, err := os.ReadDir(storagePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read directory %w", err)
	}

	cameras := make([]Camera, 0)
	for _, d := range dirs {
		path := filepath.Join(storagePath, d.Name())
		cameras = append(cameras, Camera{Path: path, Name: d.Name()})
	}

	return cameras, nil
}

// get a camera object by its name as a string

func getCamera(cameraName string) (Camera, error) {
	storagePath, err := getStoragePath()
	if err != nil {
		return Camera{}, err
	}

	cameraPath := filepath.Join(storagePath, cameraName)
	_, cameraPathExistsErr := os.Stat(cameraPath)
	if cameraPathExistsErr != nil {
		return Camera{}, cameraPathExistsErr
	}

	camera := Camera{
		Name: cameraName,
		Path: cameraPath,
	}

	return camera, nil
}

// get a list of video objects for a date

func getVideosByDay(camera Camera, day string) ([]Video, error) {
	dayQuery := strings.Replace(day, "-", "", -1)

	files, err := filepath.Glob(filepath.Join(camera.Path, dayQuery+"*.mp4"))
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

	videos := make([]Video, 0)

	for _, file := range files {
		timestamp := strings.TrimSuffix(filepath.Base(file), filepath.Ext(file))
		videos = append(videos, Video{File: file, Timestamp: timestamp})
	}

	return videos, nil
}

// get path to a recording file by camera and timestamp

func getRecordingPath(camera Camera, timestamp string) string {
	recordingPath := filepath.Join(camera.Path, timestamp+".mp4")
	return recordingPath
}

// get path to an event file by camera, timestamp, type

// get path to a video thumbnail image by corresponding video path

func getThumbnailPath(videoPath string) string {
	thumbnailPath := strings.Replace(videoPath, ".mp4", ".jpg", -1)
	return thumbnailPath
}

// check if a file exists by its path

func fileExists(filePath string) bool {
	_, err := os.Stat(filePath)
	return err == nil
}

func fileEmpty(filePath string) bool {
	fileInfo, err := os.Stat(filePath)
	if err != nil {
		return true
	}
	return fileInfo.Size() == 0
}

// generate thumbnail for a video from a video path

func generateThumbnail(videoPath string) (string, error) {

	// if the thumbnail exists return it's path
	thumbnailPath := getThumbnailPath(videoPath)
	if fileExists(thumbnailPath) {
		return thumbnailPath, nil
	}

	// open video
	video, err := gocv.OpenVideoCapture(videoPath)
	if err != nil {
		return "", errors.New("error opening video file")
	}
	defer video.Close()

	// read frame
	frame := gocv.NewMat()
	defer frame.Close()
	if ok := video.Read(&frame); !ok {
		return "", errors.New("error reading video frame")
	}
	if frame.Empty() {
		return "", errors.New("video frame has no data")
	}

	// calculate size based on width of 500 and maintaining aspect ratio

	height := frame.Rows()
	width := frame.Cols()

	newWidth := 500
	newHeight := int(float64(height) * (float64(newWidth) / float64(width)))

	resized := gocv.NewMatWithSize(newHeight, newWidth, frame.Type())
	defer resized.Close()

	gocv.Resize(frame, &resized, image.Point{X: newWidth, Y: newHeight}, 0, 0, gocv.InterpolationLinear)

	// create thumbnail and save

	params := []int{gocv.IMWriteJpegQuality, 70, gocv.IMWriteJpegOptimize, 1}
	if !gocv.IMWriteWithParams(thumbnailPath, resized, params) {
		return "", errors.New("failed to write thumbnail")
	}

	return thumbnailPath, nil
}

// get all video file paths for a camera

func getAllVideoPaths(camera Camera) ([]string, error) {
	files, err := filepath.Glob(filepath.Join(camera.Path, "*.mp4"))
	if err != nil {
		return make([]string, 0), err
	}

	// sort chronologically
	sort.Strings(files)

	// skip last file, likely to be actively being written to
	if len(files) > 0 {
		files = files[:len(files)-1]
	}

	return files, nil
}

// process videos

const deleteAfterDays = 30

func processVideos() {
	// get all cameras
	cameras, err := getCameras()
	if err != nil {
		log.Printf("error getting cameras : %v", err)
		return
	}

	// get current timestamp (for date)
	currentTime := time.Now()

	// iterate over cameras
	for _, camera := range cameras {
		processCameraVideos(camera, currentTime)
	}
}

func processCameraVideos(camera Camera, currentTime time.Time) {
	// get all video paths
	videoPaths, err := getAllVideoPaths(camera)
	if err != nil {
		log.Printf("error getting video paths for camera %s : %v", camera.Name, err)
		return
	}

	// iterate over video paths
	for _, videoPath := range videoPaths {
		processVideo(videoPath, currentTime)
	}
}

func processVideo(videoPath string, currentTime time.Time) {
	// parse filename to a timestamp
	filename := filepath.Base(videoPath)
	parsedDate, err := time.Parse("20060102", filename[:8])
	if err != nil {
		log.Printf("error parsing date from filename %s : %v", filename, err)
		return
	}

	// get the thumbnail path
	thumbnailPath := getThumbnailPath(videoPath)

	// delete video if zero length
	if fileEmpty(videoPath) {
		deleteVideoAndThumbnail(videoPath, thumbnailPath)
	}

	// determine age of file
	diff := currentTime.Sub(parsedDate)
	daysAgo := int(diff.Hours() / 24)

	// delete video if older than delete after days
	if daysAgo > deleteAfterDays {
		deleteVideoAndThumbnail(videoPath, thumbnailPath)
	}

	// create thumbnail when none exists
	if !fileExists(thumbnailPath) {
		generateThumbnail(videoPath)
	}
}

func deleteVideoAndThumbnail(videoPath, thumbnailPath string) {
	// delete thumbnail
	if fileExists(thumbnailPath) {
		err := os.Remove(thumbnailPath)
		if err != nil {
			log.Printf("error deleting thumbnail %s : %v", thumbnailPath, err)
		}
	}

	// delete video
	err := os.Remove(videoPath)
	if err != nil {
		log.Printf("error deleting video %s : %v", videoPath, err)
	}
}

// new functions for events

func getAllEvents(camera Camera) ([]Event, error) {
	events := make([]Event, 0)
	videoPaths, err := getAllVideoPaths(camera)
	if err != nil {
		return events, err
	}

	for _, file := range videoPaths {
		filename := filepath.Base(file)
		parts := strings.SplitN(filename, "-", 2)
		if len(parts) < 2 {
			continue // Skip files not matching the expected format.
		}
		timestamp := parts[0]
		eventType := parts[1]
		events = append(events, Event{Video: Video{File: file, Timestamp: timestamp}, Type: eventType})
	}

	return events, nil
}

func processEvents() {
	// get all cameras
	cameras, err := getCameras()
	if err != nil {
		log.Printf("error getting cameras : %v", err)
		return
	}

	currentTime := time.Now()

	for _, camera := range cameras {
		events, _ := getAllEvents(camera)
		for _, event := range events {
			processEvent(event.File, event.Type, currentTime)
		}
	}
}

func processEvent(videoPath string, eventType string, currentTime time.Time) {
	// parse filename to a timestamp
	filename := filepath.Base(videoPath)
	parsedDate, err := time.Parse("20060102", filename[:8])
	if err != nil {
		log.Printf("error parsing date from filename %s : %v", filename, err)
		return
	}

	// get the thumbnail path
	thumbnailPath := getThumbnailPath(videoPath)

	// delete video if zero length
	if fileEmpty(videoPath) {
		deleteVideoAndThumbnail(videoPath, thumbnailPath)
	}

	diff := currentTime.Sub(parsedDate)
	daysAgo := int(diff.Hours() / 24)

	if daysAgo > deleteAfterDays {
		deleteVideoAndThumbnail(videoPath, thumbnailPath)
	}

	// create thumbnail when none exists
	if !fileExists(thumbnailPath) {
		generateThumbnail(videoPath)
	}
}
