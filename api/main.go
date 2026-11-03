package main

import (
	"context"
	"embed"
	"errors"
	"io/fs"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
	// Zone data compiled in, so TZ works on the minimal runtime image.
	_ "time/tzdata"

	"github.com/gorilla/mux"

	"github.com/vicgarcia/tapes/internal/auth"
	"github.com/vicgarcia/tapes/internal/handlers"
	"github.com/vicgarcia/tapes/internal/logger"
)

//go:embed dist
var static embed.FS

// main starts the HTTP server and stops it gracefully on SIGINT or SIGTERM.
func main() {
	// TZ is the app time zone: log timestamps here, and the UI's days and clock via /health.
	tz := strings.TrimSpace(os.Getenv("TZ"))
	if tz == "" {
		tz = "UTC"
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		logger.Error("invalid TZ, use an IANA name such as America/New_York", "tz", tz, "error", err)
		os.Exit(1)
	}
	time.Local = loc
	logger.Info("time zone", "tz", loc.String())

	if strings.TrimSpace(os.Getenv("JWT_KEY")) == "" {
		logger.Error("missing JWT_KEY environment variable")
		os.Exit(1)
	}
	sub, err := fs.Sub(static, "dist")
	if err != nil {
		logger.Error("embedded ui unavailable", "error", err)
		os.Exit(1)
	}

	r := mux.NewRouter()
	r.HandleFunc("/health", handlers.HealthHandler).Methods("GET")
	r.HandleFunc("/login", handlers.LoginHandler).Methods("POST")
	r.HandleFunc("/logout", auth.ValidateAuth(handlers.LogoutHandler)).Methods("POST")
	r.HandleFunc("/auth", auth.ValidateAuth(handlers.AuthHandler)).Methods("GET")
	r.HandleFunc("/cameras", auth.ValidateAuth(handlers.CamerasHandler)).Methods("GET")
	r.HandleFunc("/cameras/{camera}", auth.ValidateAuth(handlers.CameraHandler)).Methods("GET")
	r.HandleFunc("/cameras/{camera}/snapshot", auth.ValidateAuth(handlers.SnapshotHandler)).Methods("GET")
	r.HandleFunc("/cameras/{camera}/recordings", auth.ValidateAuth(handlers.RecordingsHandler)).Methods("GET")
	r.HandleFunc("/cameras/{camera}/playback", auth.ValidateAuth(handlers.PlaybackHandler)).Methods("GET", "HEAD")
	r.PathPrefix("/cameras/{camera}/live/").Handler(auth.ValidateAuth(handlers.LiveStreamHandler)).Methods("GET")
	r.PathPrefix("/").Handler(http.FileServer(http.FS(sub)))

	// ReadTimeout bounds request bodies; it doesn't cut off long responses. There is no
	// write timeout, because live playlists block and clips can take a while to prepare.
	srv := &http.Server{
		Addr:              ":8671",
		Handler:           handlers.LogRequests(r),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		IdleTimeout:       2 * time.Minute,
		MaxHeaderBytes:    64 << 10,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	// ListenAndServe returns as soon as shutdown starts; main waits here for in-flight requests.
	drained := make(chan struct{})
	go func() {
		defer close(drained)
		<-ctx.Done()
		logger.Info("shutting down http server")
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdown); err != nil {
			logger.Error("http server shutdown incomplete", "error", err)
		}
	}()

	logger.Info("starting http server", "port", 8671)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Error("http server failed", "error", err)
		os.Exit(1)
	}
	<-drained
	logger.Info("http server stopped")
}
