package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gorilla/mux"

	"github.com/vicgarcia/tapes/internal/auth"
	"github.com/vicgarcia/tapes/internal/handlers"
)

//go:embed dist
var static embed.FS

// main starts the HTTP server.
func main() {
	if strings.TrimSpace(os.Getenv("JWT_KEY")) == "" {
		log.Fatal("JWT_KEY is required")
	}
	sub, _ := fs.Sub(static, "dist")
	r := mux.NewRouter()
	r.HandleFunc("/health", handlers.HealthHandler).Methods("GET")
	r.HandleFunc("/login", handlers.LoginHandler).Methods("POST")
	r.HandleFunc("/logout", auth.ValidateAuth(handlers.LogoutHandler)).Methods("POST")
	r.HandleFunc("/auth", auth.ValidateAuth(handlers.AuthHandler)).Methods("GET")
	r.HandleFunc("/cameras", auth.ValidateAuth(handlers.CamerasHandler)).Methods("GET")
	r.HandleFunc("/cameras/{camera}", auth.ValidateAuth(handlers.CameraHandler)).Methods("GET")
	r.PathPrefix("/cameras/{camera}/live/").Handler(auth.ValidateAuth(handlers.LiveStreamHandler)).Methods("GET")
	r.PathPrefix("/").Handler(http.FileServer(http.FS(sub)))
	srv := &http.Server{Addr: ":8671", Handler: r}
	log.Fatal(srv.ListenAndServe())
}
