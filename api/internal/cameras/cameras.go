package cameras

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/vicgarcia/tapes/internal/env"
)

// Camera represents a camera with its storage paths
type Camera struct {
	Path string `json:"-"`
	Name string `json:"name"`
}

// GetStoragePath returns the base storage path from environment variable
func GetStoragePath() (string, error) {
	storagePath := env.GetWithDefault("STORAGE_PATH", "/data/cameras")
	return storagePath, nil
}

// GetAll returns a list of all available cameras
func GetAll() ([]Camera, error) {
	storagePath, err := GetStoragePath()
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

// GetByName returns a camera by its name
func GetByName(cameraName string) (Camera, error) {
	storagePath, err := GetStoragePath()
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
