package main

import (
	"embed"
	"io/fs"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	// "github.com/joho/godotenv"

	"github.com/vicgarcia/tapes/internal/auth"
	"github.com/vicgarcia/tapes/internal/handlers"
	"github.com/vicgarcia/tapes/internal/logger"
	"github.com/vicgarcia/tapes/internal/media"
)

// static files

//go:embed dist
var static embed.FS

// web server

func main() {
	// load .env file from the same path as the executable
	// log.Println("loading environment config")
	// err := godotenv.Load(".env")
	// if err != nil {
	// 	log.Fatalf("error loading .env file : %v", err)
	// 	return
	// }

	// create signal channel for graceful shutdown from os signal
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	// static filesystem
	staticFS, _ := fs.Sub(static, "dist")

	// setup router
	r := mux.NewRouter()
	r.HandleFunc("/health", handlers.HealthHandler).Methods("GET")
	r.HandleFunc("/login", handlers.LoginHandler).Methods("POST")
	r.HandleFunc("/logout", handlers.LogoutHandler).Methods("POST")
	r.HandleFunc("/auth", auth.ValidateAuth(handlers.AuthHandler)).Methods("GET")
	r.HandleFunc("/cameras", auth.ValidateAuth(handlers.CamerasHandler)).Methods("GET")
	r.HandleFunc("/cameras/{camera}/recordings", auth.ValidateAuth(handlers.RecordingsHandler)).Methods("GET")
	r.HandleFunc("/cameras/{camera}/recordings/{timestamp}/video", auth.ValidateAuth(handlers.RecordingVideoHandler)).Methods("GET")
	r.HandleFunc("/cameras/{camera}/recordings/{timestamp}/thumbnail", auth.ValidateAuth(handlers.RecordingThumbnailHandler)).Methods("GET")

	r.PathPrefix("/").Handler(http.FileServer(http.FS(staticFS)))

	// create server
	srv := &http.Server{
		Addr:    ":8671",
		Handler: r,
	}

	// start http server in a goroutine
	go func() {
		logger.Info("starting http server", "port", 8671)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("http server error", "error", err)
		}
	}()

	// start background curration process in a goroutine
	done := make(chan bool)
	go func() {
		logger.Info("starting background video processing")
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		media.ProcessAllVideos()
		for {
			select {
			case <-ticker.C:
				logger.Debug("running scheduled video processing")
				media.ProcessAllVideos()
			case <-done:
				logger.Info("stopping background video processing")
				return
			}
		}
	}()

	// wait for interrupt signal
	<-stop
	logger.Info("shutting down server")

	// stop http server
	if err := srv.Close(); err != nil {
		logger.Error("http server shutdown error", "error", err)
	}

	// stop curation process
	close(done)
	logger.Info("server shutdown complete")
}
