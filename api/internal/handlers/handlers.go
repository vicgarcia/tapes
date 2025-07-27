package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/gorilla/mux"

	"github.com/vicgarcia/tapes/internal/auth"
	"github.com/vicgarcia/tapes/internal/cameras"
	"github.com/vicgarcia/tapes/internal/logger"
	"github.com/vicgarcia/tapes/internal/media"
)

// HealthHandler returns 200 with no content for health checks
func HealthHandler(writer http.ResponseWriter, request *http.Request) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(http.StatusOK)
	writer.Write([]byte(`{"status": "success"}`))
}

// AuthHandler returns status to indicate validity of authentication cookie
func AuthHandler(writer http.ResponseWriter, request *http.Request) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(http.StatusOK)
	writer.Write([]byte(`{"status": "success"}`))
}

// LoginHandler sets auth cookie on successful authentication
func LoginHandler(writer http.ResponseWriter, request *http.Request) {
	request.ParseForm()

	passwd, err := auth.GetPasswd()
	if err != nil {
		log.Fatal(err)
		http.Error(writer, "login failed", http.StatusInternalServerError)
		return
	}

	username := request.FormValue("username")
	password := request.FormValue("password")
	if username == "" || password == "" {
		http.Error(writer, "login failed", http.StatusUnauthorized)
		return
	}

	validLogin := passwd.Match(username, password)
	if !validLogin {
		http.Error(writer, "login failed", http.StatusUnauthorized)
		return
	}

	err = auth.SetCookie(writer, username)
	if err != nil {
		log.Fatal(err)
		http.Error(writer, "login failed", http.StatusUnauthorized)
		return
	}

	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(http.StatusOK)
	writer.Write([]byte(`{"status": "success"}`))
}

// LogoutHandler clears the auth cookie
func LogoutHandler(writer http.ResponseWriter, request *http.Request) {
	err := auth.DeleteCookie(writer)
	if err != nil {
		log.Fatal(err)
		http.Error(writer, "logout failed", http.StatusUnauthorized)
	}

	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(http.StatusOK)
	writer.Write([]byte(`{"status": "success"}`))
}

// CamerasHandler returns json list of cameras
func CamerasHandler(writer http.ResponseWriter, request *http.Request) {
	cameras, err := cameras.GetAll()
	if err != nil {
		http.Error(writer, "error querying cameras", http.StatusInternalServerError)
		return
	}

	response, err := json.Marshal(cameras)
	if err != nil {
		http.Error(writer, "failed to marshal JSON", http.StatusInternalServerError)
		return
	}

	writer.Header().Set("Content-Type", "application/json")
	writer.Write(response)
}

// RecordingsHandler queries recordings by date
func RecordingsHandler(writer http.ResponseWriter, request *http.Request) {
	vars := mux.Vars(request)
	cameraName := vars["camera"]
	camera, err := cameras.GetByName(cameraName)
	if err != nil {
		http.Error(writer, "invalid camera", http.StatusBadRequest)
		return
	}

	day := request.URL.Query().Get("day")
	// todo: validate day

	recordings, err := media.GetRecordingsByDay(camera, day)
	if err != nil {
		logger.Error(fmt.Sprintf("error querying recordings for camera %s, day %s: %v", cameraName, day, err))
		http.Error(writer, "error querying recordings", http.StatusInternalServerError)
		return
	}

	logger.Debug(fmt.Sprintf("found %d recordings for camera %s, day %s", len(recordings), cameraName, day))

	response, err := json.Marshal(recordings)
	if err != nil {
		logger.Error(fmt.Sprintf("failed to marshal recordings json: %v", err))
		http.Error(writer, "failed to generate json", http.StatusInternalServerError)
		return
	}

	writer.Header().Set("Content-Type", "application/json")
	writer.Write(response)
}

// RecordingThumbnailHandler serves video thumbnail images, creates when they do not exist
func RecordingThumbnailHandler(writer http.ResponseWriter, request *http.Request) {
	vars := mux.Vars(request)
	cameraName := vars["camera"]
	timestamp := vars["timestamp"]

	camera, err := cameras.GetByName(cameraName)
	if err != nil {
		http.Error(writer, "invalid camera", http.StatusBadRequest)
		return
	}

	// check if the video file exists outside of getThumbnail to manage error status
	recordingPath := media.GetRecordingPath(camera, timestamp)
	if !media.FileExists(recordingPath) {
		http.Error(writer, "video file does not exist", http.StatusNotFound)
	}

	// get the thumbnail, will be created if it does not already exist
	thumbnailPath := media.GetThumbnailPath(recordingPath)
	if !media.FileExists(thumbnailPath) {
		thumbnailPath, err = media.GenerateThumbnail(recordingPath)
		if err != nil {
			http.Error(writer, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	http.ServeFile(writer, request, thumbnailPath)
}

// RecordingVideoHandler serves video files
func RecordingVideoHandler(writer http.ResponseWriter, request *http.Request) {
	vars := mux.Vars(request)
	cameraName := vars["camera"]
	timestamp := vars["timestamp"]

	camera, err := cameras.GetByName(cameraName)
	if err != nil {
		http.Error(writer, "invalid camera", http.StatusBadRequest)
		return
	}

	recordingPath := media.GetRecordingPath(camera, timestamp)
	if !media.FileExists(recordingPath) {
		http.Error(writer, "video file does not exist", http.StatusNotFound)
	}

	http.ServeFile(writer, request, recordingPath)
}

// EventsHandler queries events by date
func EventsHandler(writer http.ResponseWriter, request *http.Request) {
	vars := mux.Vars(request)
	cameraName := vars["camera"]
	camera, err := cameras.GetByName(cameraName)
	if err != nil {
		http.Error(writer, "invalid camera", http.StatusBadRequest)
		return
	}

	logger.Debug(fmt.Sprintf("camera path: %s, events path: %s", camera.Path, camera.EventsPath()))

	events, err := media.GetEventsByDay(camera, day)
	if err != nil {
		logger.Error(fmt.Sprintf("error querying events for camera %s, day %s: %v", cameraName, day, err))
		http.Error(writer, "error querying events", http.StatusInternalServerError)
		return
	}

	logger.Debug(fmt.Sprintf("found %d events for camera %s, day %s", len(events), cameraName, day))

	response, err := json.Marshal(events)
	if err != nil {
		logger.Error(fmt.Sprintf("failed to marshal events json: %v", err))
		http.Error(writer, "failed to generate json", http.StatusInternalServerError)
		return
	}

	writer.Header().Set("Content-Type", "application/json")
	writer.Write(response)
}

// EventThumbnailHandler serves event thumbnail images, creates when they do not exist
func EventThumbnailHandler(writer http.ResponseWriter, request *http.Request) {
	vars := mux.Vars(request)
	cameraName := vars["camera"]
	timestamp := vars["timestamp"]

	camera, err := cameras.GetByName(cameraName)
	if err != nil {
		http.Error(writer, "invalid camera", http.StatusBadRequest)
		return
	}

	// find the event file (may have different event type suffix)
	eventPath := media.GetEventPath(camera, timestamp)
	if eventPath == "" || !media.FileExists(eventPath) {
		http.Error(writer, "event file does not exist", http.StatusNotFound)
		return
	}

	// get the thumbnail, will be created if it does not already exist
	thumbnailPath := media.GetThumbnailPath(eventPath)
	if !media.FileExists(thumbnailPath) {
		thumbnailPath, err = media.GenerateThumbnail(eventPath)
		if err != nil {
			http.Error(writer, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	http.ServeFile(writer, request, thumbnailPath)
}

// EventVideoHandler serves event video files
func EventVideoHandler(writer http.ResponseWriter, request *http.Request) {
	vars := mux.Vars(request)
	cameraName := vars["camera"]
	timestamp := vars["timestamp"]

	camera, err := cameras.GetByName(cameraName)
	if err != nil {
		http.Error(writer, "invalid camera", http.StatusBadRequest)
		return
	}

	// find the event file (may have different event type suffix)
	eventPath := media.GetEventPath(camera, timestamp)
	if eventPath == "" || !media.FileExists(eventPath) {
		http.Error(writer, "event file does not exist", http.StatusNotFound)
		return
	}

	http.ServeFile(writer, request, eventPath)
}
