package main

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/gorilla/mux"
)

// health check endpoint
// returns 200 with no content

func healthHandler(writer http.ResponseWriter, request *http.Request) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(http.StatusOK)
	writer.Write([]byte(`{"status": "success"}`))
}

// authentication check endpoint
// returns status to indicate validity of authentication cookie

func authHandler(writer http.ResponseWriter, request *http.Request) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(http.StatusOK)
	writer.Write([]byte(`{"status": "success"}`))
}

// login endpoint
// sets auth cookie on successful authentication

func loginHandler(writer http.ResponseWriter, request *http.Request) {
	request.ParseForm()

	passwd, err := getPasswd()
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

	err = setCookie(writer, username)
	if err != nil {
		log.Fatal(err)
		http.Error(writer, "login failed", http.StatusUnauthorized)
		return
	}

	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(http.StatusOK)
	writer.Write([]byte(`{"status": "success"}`))
}

// logout endpoint
// clear auth cookie

func logoutHandler(writer http.ResponseWriter, request *http.Request) {
	err := deleteCookie(writer)
	if err != nil {
		log.Fatal(err)
		http.Error(writer, "logout failed", http.StatusUnauthorized)
	}

	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(http.StatusOK)
	writer.Write([]byte(`{"status": "success"}`))
}

// cameras endpoint
// returns json list of cameras

func camerasHandler(writer http.ResponseWriter, request *http.Request) {
	cameras, err := getCameras()
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

// camera endpoint
// query recordings by date

func cameraHandler(writer http.ResponseWriter, request *http.Request) {
	vars := mux.Vars(request)
	cameraName := vars["camera"]
	camera, err := getCamera(cameraName)
	if err != nil {
		http.Error(writer, "invalid camera", http.StatusBadRequest)
		return
	}

	day := request.URL.Query().Get("day")
	// todo: validate day

	recordings, err := getVideosByDay(camera, day)
	if err != nil {
		http.Error(writer, "error querying recordings", http.StatusInternalServerError)
		return
	}

	response, err := json.Marshal(recordings)
	if err != nil {
		http.Error(writer, "failed to generate json", http.StatusInternalServerError)
		return
	}

	writer.Header().Set("Content-Type", "application/json")
	writer.Write(response)
}

// thumbnail endpoint
// serve video thumbnail images, create when they do not exist

func thumbnailHandler(writer http.ResponseWriter, request *http.Request) {
	vars := mux.Vars(request)
	cameraName := vars["camera"]
	timestamp := vars["timestamp"]

	camera, err := getCamera(cameraName)
	if err != nil {
		http.Error(writer, "invalid camera", http.StatusBadRequest)
		return
	}

	// check if the video file exists outside of getThumbnail to manage error status
	videoPath := getVideoPath(camera, timestamp)
	if !fileExists(videoPath) {
		http.Error(writer, "video file does not exist", http.StatusNotFound)
	}

	// get the thumbnail, will be created if it does not already exist
	thumbnailPath := getThumbnailPath(videoPath)
	if !fileExists(thumbnailPath) {
		thumbnailPath, err = generateThumbnail(videoPath)
		if err != nil {
			http.Error(writer, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	http.ServeFile(writer, request, thumbnailPath)
}

// video endpoint
// serve video file

func videoHandler(writer http.ResponseWriter, request *http.Request) {
	vars := mux.Vars(request)
	cameraName := vars["camera"]
	timestamp := vars["timestamp"]

	camera, err := getCamera(cameraName)
	if err != nil {
		http.Error(writer, "invalid camera", http.StatusBadRequest)
		return
	}

	videoPath := getVideoPath(camera, timestamp)
	if !fileExists(videoPath) {
		http.Error(writer, "video file does not exist", http.StatusNotFound)
	}

	http.ServeFile(writer, request, videoPath)
}
