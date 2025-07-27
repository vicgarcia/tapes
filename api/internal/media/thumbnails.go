package media

import (
	"errors"
	"image"
	"os"
	"strings"

	"gocv.io/x/gocv"
)

// GetThumbnailPath returns the thumbnail path for a video path
func GetThumbnailPath(videoPath string) string {
	thumbnailPath := strings.Replace(videoPath, ".mp4", ".jpg", -1)
	return thumbnailPath
}

// FileExists checks if a file exists by its path
func FileExists(filePath string) bool {
	_, err := os.Stat(filePath)
	return err == nil
}

// GenerateThumbnail creates a thumbnail for a video from a video path
func GenerateThumbnail(videoPath string) (string, error) {
	// if the thumbnail exists return its path
	thumbnailPath := GetThumbnailPath(videoPath)
	if FileExists(thumbnailPath) {
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
