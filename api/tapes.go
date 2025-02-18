package main

import (
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/mux"
	"github.com/joho/godotenv"
	"github.com/tg123/go-htpasswd"
	"gocv.io/x/gocv"
)

type Camera struct {
	Path string `json:"-"`
	Name string `json:"name"`
}

type Video struct {
	File      string `json:"-"`
	Timestamp string `json:"timestamp"`
}

const deleteAfterDays = 90

// ----- functions -----

// load passwords file for use validating passwords
func getPasswd() (*htpasswd.File, error) {
	passwdPath := os.Getenv("PASSWORDS_PATH")
	if passwdPath == "" {
		return &htpasswd.File{}, fmt.Errorf("missing PASSWORDS_PATH environment variable")
	}

	passwd, err := htpasswd.New(passwdPath, htpasswd.DefaultSystems, nil)
	if err != nil {
		return &htpasswd.File{}, err
	}

	return passwd, nil
}

// generate jwt token
func generateToken(username string) (string, error) {
	issuer := os.Getenv("JWT_ISSUER")
	if issuer == "" {
		issuer = "tapes"
	}

	key := os.Getenv("JWT_KEY")
	if key == "" {
		return "", fmt.Errorf("missing JWT_KEY environment variable")
	}

	tokenLife, _ := time.ParseDuration("180m")
	token := jwt.NewWithClaims(
		jwt.SigningMethodHS256,
		jwt.RegisteredClaims{
			Issuer:    issuer,
			Subject:   username,
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(tokenLife)),
		},
	)

	return token.SignedString([]byte(key))
}

// parse jwt token
func parseJwtToken(tokenString string) (*jwt.Token, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		key := os.Getenv("JWT_KEY")
		if key == "" {
			return []byte(key), fmt.Errorf("missing JWT_KEY environment variable")
		}
		return []byte(key), nil
	})
	return token, err
}

// middleware to validate jwt token in auth header
func validateAuthHeader(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		headerToken := r.Header.Get("Authorization")
		headerToken = strings.Replace(headerToken, "Bearer ", "", -1)
		token, err := parseJwtToken(headerToken)

		if err != nil {
			if errors.Is(err, jwt.ErrTokenExpired) || errors.Is(err, jwt.ErrTokenNotValidYet) {
				http.Error(w, "expired token", http.StatusUnauthorized)
				return
			}

			http.Error(w, "error parsing token", http.StatusUnauthorized)
			return
		}

		if !token.Valid {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}

		next(w, r)
	}
}

// middleware to validate jwt token in url param
func validateAuthParam(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		paramToken := r.URL.Query().Get("token")
		token, err := parseJwtToken(paramToken)

		if err != nil {
			if errors.Is(err, jwt.ErrTokenExpired) || errors.Is(err, jwt.ErrTokenNotValidYet) {
				http.Error(w, "expired token", http.StatusUnauthorized)
				return
			}
			http.Error(w, "error parsing token", http.StatusUnauthorized)
			return
		}

		if !token.Valid {
			http.Error(w, "invalid authentication", http.StatusUnauthorized)
			return
		}

		next(w, r)
	}
}

// get path to saved recording files from env var
func getVideosPath() (string, error) {
	videosPath := os.Getenv("RECORDINGS_PATH")
	if videosPath == "" {
		return "", fmt.Errorf("missing RECORDINGS_PATH environment variable")
	}

	return videosPath, nil
}

func getCameras() ([]Camera, error) {
	videosPath, err := getVideosPath()
	if err != nil {
		return nil, err
	}

	dirs, err := os.ReadDir(videosPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read directory %w", err)
	}

	cameras := make([]Camera, 0)
	for _, d := range dirs {
		path := filepath.Join(videosPath, d.Name())
		cameras = append(cameras, Camera{Path: path, Name: d.Name()})
	}

	return cameras, nil
}

func getCamera(cameraName string) (Camera, error) {
	videosPath, err := getVideosPath()
	if err != nil {
		return Camera{}, err
	}

	cameraPath := filepath.Join(videosPath, cameraName)
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

func getVideoPath(camera Camera, timestamp string) string {
	videoPath := filepath.Join(camera.Path, timestamp+".mp4")
	return videoPath
}

func getThumbnailPath(videoPath string) string {
	thumbnailPath := strings.Replace(videoPath, ".mp4", ".jpg", -1)
	return thumbnailPath
}

func fileExists(filePath string) bool {
	_, err := os.Stat(filePath)
	return err == nil
}

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

func getAllVideoPaths(camera Camera) ([]string, error) {
	files, err := filepath.Glob(filepath.Join(camera.Path, "*.mp4"))
	if err != nil {
		return make([]string, 0), err
	}

	// sort chronologically
	sort.Strings(files)

	// skip last file, likely to be actively being written to
	files = files[:len(files)-1]

	return files, nil
}

func currateVideos() {
	// get all cameras
	cameras, err := getCameras()
	if err != nil {
		return
	}

	// get current timestamp (for date)
	currentTime := time.Now()

	// iterate over cameras
	for _, camera := range cameras {

		// get all video paths
		videoPaths, err := getAllVideoPaths(camera)
		if err != nil {
			continue
		}

		// iterate over video paths
		for _, videoPath := range videoPaths {

			// handle deleting of old files
			filename := filepath.Base(videoPath)
			parsedDate, err := time.Parse("20260102", filename[:8])
			if err == nil {
				diff := currentTime.Sub(parsedDate)
				daysAgo := int(diff.Hours() / 24)
				if daysAgo > deleteAfterDays {
					// check and delete thumbnail
					// delete file (video)
					continue
				}
			}

			// check for a thumbnail and create when missing
			thumbnailPath := getThumbnailPath(videoPath)
			if !fileExists(thumbnailPath) {
				generateThumbnail(videoPath)
			}

		}
	}

	return
}

// ----- handlers -----

// health check endpoint
// returns 200 with no content
func healthHandler(writer http.ResponseWriter, request *http.Request) {
	fmt.Fprintf(writer, "OK")
}

// login endpoint
// returns token on successful authentication
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

	token, err := generateToken(username)
	if err != nil {
		log.Fatal(err)
		http.Error(writer, "login failed", http.StatusInternalServerError)
		return
	}

	// return token json
	writer.Write([]byte(token))
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

// static files

//go:embed dist
var static embed.FS

// ----- main -----

func main() {

	// load .env file from the same path as the executable
	log.Println("loading environment config")
	err := godotenv.Load(".env")
	if err != nil {
		log.Fatalf("error loading .env file : %v", err)
		return
	}

	// static filesystem
	staticFS, _ := fs.Sub(static, "dist")

	// setup router
	r := mux.NewRouter()
	r.HandleFunc("/health", healthHandler).Methods("GET")
	r.HandleFunc("/login", loginHandler).Methods("POST")
	r.HandleFunc("/cameras", validateAuthHeader(camerasHandler)).Methods("GET")
	r.HandleFunc("/cameras/{camera}", validateAuthHeader(cameraHandler)).Methods("GET")
	r.HandleFunc("/cameras/{camera}/{timestamp}/video", validateAuthParam(videoHandler))
	r.HandleFunc("/cameras/{camera}/{timestamp}/thumbnail", validateAuthHeader(thumbnailHandler)).Methods("GET")
	r.PathPrefix("/").Handler(http.FileServer(http.FS(staticFS)))

	// start server
	log.Println("starting http server")
	srv := &http.Server{
		Addr:    ":8633",
		Handler: r,
	}
	log.Fatal(srv.ListenAndServe())
}
