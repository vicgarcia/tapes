package handlers

import (
	"encoding/json"
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

	username := request.FormValue("username")
	logger.Info("login attempt", "username", username, "remote_addr", request.RemoteAddr)

	passwd, err := auth.GetPasswd()
	if err != nil {
		logger.Error("failed to get password file", "error", err)
		http.Error(writer, "login failed", http.StatusInternalServerError)
		return
	}

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
		logger.Error("failed to set auth cookie", "error", err)
		http.Error(writer, "login failed", http.StatusUnauthorized)
		return
	}

	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(http.StatusOK)
	writer.Write([]byte(`{"status": "success"}`))
}

// LogoutHandler clears the auth cookie
func LogoutHandler(writer http.ResponseWriter, request *http.Request) {
	logger.Info("logout", "remote_addr", request.RemoteAddr)

	err := auth.DeleteCookie(writer)
	if err != nil {
		logger.Error("failed to delete auth cookie", "error", err)
		http.Error(writer, "logout failed", http.StatusUnauthorized)
	}

	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(http.StatusOK)
	writer.Write([]byte(`{"status": "success"}`))
}

// CamerasHandler returns json list of cameras
func CamerasHandler(writer http.ResponseWriter, request *http.Request) {
	logger.Info("cameras request", "remote_addr", request.RemoteAddr)

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
	day := request.URL.Query().Get("day")

	logger.Info("recordings request", "camera", cameraName, "day", day, "remote_addr", request.RemoteAddr)

	camera, err := cameras.GetByName(cameraName)
	if err != nil {
		logger.Error("invalid camera", "camera", cameraName, "error", err)
		http.Error(writer, "invalid camera", http.StatusBadRequest)
		return
	}

	recordings, err := media.GetRecordingsByDay(camera, day)
	if err != nil {
		logger.Error("error querying recordings", "camera", cameraName, "day", day, "error", err)
		http.Error(writer, "error querying recordings", http.StatusInternalServerError)
		return
	}

	logger.Debug("found recordings", "camera", cameraName, "day", day, "count", len(recordings))

	response, err := json.Marshal(recordings)
	if err != nil {
		logger.Error("failed to marshal recordings json", "error", err)
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

	logger.Info("thumbnail request", "camera", cameraName, "timestamp", timestamp, "remote_addr", request.RemoteAddr)

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

	logger.Info("video request", "camera", cameraName, "timestamp", timestamp, "remote_addr", request.RemoteAddr)

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
