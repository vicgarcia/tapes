package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	"github.com/joho/godotenv"
)

// static files

//go:embed dist
var static embed.FS

// web server

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.SetOutput(os.Stdout)

	// load .env file from the same path as the executable
	log.Println("loading environment config")
	err := godotenv.Load(".env")
	if err != nil {
		log.Fatalf("error loading .env file : %v", err)
		return
	}

	// create signal channel for graceful shutdown from os signal
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	// static filesystem
	staticFS, _ := fs.Sub(static, "dist")

	// setup router
	r := mux.NewRouter()
	r.HandleFunc("/health", healthHandler).Methods("GET")
	r.HandleFunc("/login", loginHandler).Methods("POST")
	r.HandleFunc("/auth", validateAuth(authHandler)).Methods()
	r.HandleFunc("/cameras", validateAuth(camerasHandler)).Methods("GET")
	r.HandleFunc("/cameras/{camera}", validateAuth(cameraHandler)).Methods("GET")
	r.HandleFunc("/cameras/{camera}/{timestamp}/video", validateAuth(videoHandler))
	r.HandleFunc("/cameras/{camera}/{timestamp}/thumbnail", validateAuth(thumbnailHandler)).Methods("GET")
	r.PathPrefix("/").Handler(http.FileServer(http.FS(staticFS)))

	// create server
	srv := &http.Server{
		Addr:    ":8633",
		Handler: r,
	}

	// start http server in a goroutine
	go func() {
		log.Println("starting http server")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("http server error %v", err)
		}
	}()

	// start background curration process in a goroutine
	done := make(chan bool)
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		processVideos()
		for {
			select {
			case <-ticker.C:
				processVideos()
			case <-done:
				return
			}
		}
	}()

	// wait for interrupt signal
	<-stop
	log.Println("shutting down")

	// stop http server
	if err := srv.Close(); err != nil {
		log.Printf("http server error %v", err)
	}

	// stop curation process
	close(done)
}
