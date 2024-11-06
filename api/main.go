package main

import (
    "log"
    "fmt"
    "os"
    "time"
    "strings"
    "errors"
    "path/filepath"
    "embed"
    "io/fs"
    "net/http"
    "encoding/json"

    "github.com/joho/godotenv"
    "github.com/gorilla/mux"
    "github.com/tg123/go-htpasswd"
    "github.com/golang-jwt/jwt/v5"
    "gocv.io/x/gocv"
)


type Camera struct {
    Path string `json:"-"`
    Name string `json:"name"`
}


type Recording struct {
    File string `json:"-"`
    Timestamp string `json:"timestamp"`
}


// ----- functions -----


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


func generateToken(username string) (string, error) {
    const issuer = "tapes.4406fillmore.com"

    key := os.Getenv("JWT_KEY")
    if key == "" {
        return "", fmt.Errorf("missing JWT_KEY environment variable")
    }

    tokenLife, _ := time.ParseDuration("90m")
    token := jwt.NewWithClaims(
        jwt.SigningMethodHS256,
        jwt.RegisteredClaims{
            Issuer: issuer,
            Subject: username,
            ExpiresAt: jwt.NewNumericDate(time.Now().Add(tokenLife)),
        },
    )

    return token.SignedString([]byte(key))
}


func parseJwtToken(tokenString string) (*jwt.Token, error) {
    token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
        key := os.Getenv("JWT_KEY")
        if key == "" {
            return []byte(key), fmt.Errorf("missing JWT_KEY environment variable")
        }
        return []byte(key), nil
    })
    return token, err;
}


func validateAuthHeader(next http.HandlerFunc) http.HandlerFunc {
    // validate jwt token in auth header

	return func(w http.ResponseWriter, r *http.Request) {
        headerToken := r.Header.Get("Authorization")
        headerToken = strings.Replace(headerToken, "Bearer ", "", -1)
        token, err := parseJwtToken(headerToken);

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


func validateAuthParam(next http.HandlerFunc) http.HandlerFunc {
    // validate jwt token in auth header

	return func(w http.ResponseWriter, r *http.Request) {
        paramToken := r.URL.Query().Get("token")
        token, err := parseJwtToken(paramToken);

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


func getRecordingsPath() (string, error) {
    recordingsPath := os.Getenv("RECORDING_PATH")
    if recordingsPath == "" {
        return "", fmt.Errorf("missing RECORDING_PATH environment variable")
    }

    return recordingsPath, nil
}


func getCameras() ([]Camera, error) {
    recordingsPath, err := getRecordingsPath()
    if err != nil {
        return nil, err
    }

    dirs, err := os.ReadDir(recordingsPath)
    if err != nil {
        return nil, fmt.Errorf("failed to read directory %w", err)
    }

    cameras := make([]Camera, 0)
    for _, d := range dirs {
        path := filepath.Join(recordingsPath, d.Name())
        cameras = append(cameras, Camera{Path: path, Name: d.Name()})
    }

    return cameras, nil
}


func getCamera(cameraName string) (Camera, error) {
    recordingsPath, err := getRecordingsPath()
    if err != nil {
        return Camera{}, err
    }

    cameraPath := filepath.Join(recordingsPath, cameraName)
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


func getRecordingsByDay(camera Camera, day string) ([]Recording, error) {
    dayQuery := strings.Replace(day, "-", "", -1)
    files, err := filepath.Glob(filepath.Join(camera.Path, dayQuery + "*.mp4"))
    if err != nil {
        return nil, err
    }

    recordings := make([]Recording, 0)
    for _, file := range files {
        timestamp := strings.TrimSuffix(filepath.Base(file), filepath.Ext(file))
        recordings = append(recordings, Recording{File: file, Timestamp: timestamp})
    }

    return recordings, nil
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

        http.Error(writer, "error validating password", http.StatusInternalServerError)
        return
    }

    username := request.FormValue("username")
    password := request.FormValue("password")
    if username == "" || password == "" {
        http.Error(writer, "invalid credentials", http.StatusUnauthorized)
        return
    }

    validLogin := passwd.Match(username, password)
    if validLogin != true {
        http.Error(writer, "login failed", http.StatusUnauthorized)
        return
    }

    token, err := generateToken(username)
    if err != nil {
        http.Error(writer, err.Error(), http.StatusInternalServerError)
        return
    }

    // return token json
    writer.Write([]byte(token))
}


// cameras endpoint
// returns json list of cameras

func camerasHandler(writer http.ResponseWriter, request *http.Request) {
    names, err := getCameras()
    if err != nil {
        http.Error(writer, "error querying cameras", http.StatusInternalServerError)
        return
    }

    response, err := json.Marshal(names)
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
    }

    day := request.URL.Query().Get("day")
    // todo: validate day

    recordings, err := getRecordingsByDay(camera, day)
    if err != nil {
        http.Error(writer, "error querying recordings", http.StatusInternalServerError)
        return
    }

    response, err := json.Marshal(recordings)
    if err != nil {
        http.Error(writer, "failed to marshal JSON", http.StatusInternalServerError)
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
    }

    thumbnailPath := filepath.Join(camera.Path, timestamp + ".jpg")

    _, thumbnailExistsErr := os.Stat(thumbnailPath)
    if thumbnailExistsErr != nil {

        // if the error is not due to file existance return error response
        if !errors.Is(thumbnailExistsErr, os.ErrNotExist) {
            http.Error(writer, err.Error(), http.StatusInternalServerError)
            return
        }

        // check video file exists
        videoPath := filepath.Join(camera.Path, timestamp + ".mp4")
        _, err = os.Stat(videoPath)
        if err != nil {
            http.Error(writer, "video does not exist", http.StatusNotFound)
        }

        // open video file
        video, err := gocv.OpenVideoCapture(videoPath)
        if err != nil {
            http.Error(writer, err.Error(), http.StatusInternalServerError)
            return
        }

        // read frame and write to image file

        frame := gocv.NewMat()
        defer frame.Close()

        if ok := video.Read(&frame); !ok {
            http.Error(writer, "error reading video frame", http.StatusInternalServerError)
            return
        }

        if frame.Empty() {
            http.Error(writer, "video frame has not data", http.StatusInternalServerError)
            return
        }

        gocv.IMWrite(thumbnailPath, frame)
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
    }

    videoPath := filepath.Join(camera.Path, timestamp + ".mp4")
    _, err = os.Stat(videoPath)
    if err != nil {
        http.Error(writer, "video does not exist", http.StatusNotFound)
    }

    http.ServeFile(writer, request, videoPath)
}


// static files

//go:embed dist
var static embed.FS


// ----- main -----

func main() {

    // load .env file from the same path as the executable
    err := godotenv.Load(".env")
    if err != nil {
        log.Fatalf("Error loading .env file: %v", err)
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
    srv := &http.Server{
        Addr: ":8080",
        Handler: r,
    }

    log.Fatal(srv.ListenAndServe())
}

