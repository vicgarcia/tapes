package main

import (
	"fmt"
	"os"
	"path/filepath"
)

// Camera object
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
