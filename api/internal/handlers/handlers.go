package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/mux"

	"github.com/vicgarcia/tapes/internal/auth"
	"github.com/vicgarcia/tapes/internal/cameras"
	"github.com/vicgarcia/tapes/internal/logger"
	"github.com/vicgarcia/tapes/internal/mediamtx"
)

// proxiedHeaders are the upstream HLS headers passed to the browser. Anything
// else, such as MediaMTX's CORS or cookie headers, stays on the internal hop.
var proxiedHeaders = []string{"Content-Type", "Content-Length", "Cache-Control", "Last-Modified", "ETag"}

// jsonError writes a JSON error response with the given status code.
func jsonError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// writeJSON writes v as a JSON response, logging encoding failures.
func writeJSON(w http.ResponseWriter, r *http.Request, v any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil && r.Context().Err() == nil {
		logger.Error("json response failed", "path", r.URL.Path, "error", err)
	}
}

// requireCamera writes 404 for an unknown camera and 502 when MediaMTX can't be
// asked, returning whether the request may continue.
func requireCamera(w http.ResponseWriter, r *http.Request) bool {
	name := mux.Vars(r)["camera"]
	_, err := cameras.GetByName(r.Context(), name)
	switch {
	case err == nil:
		return true
	case errors.Is(err, cameras.ErrNotFound):
		jsonError(w, http.StatusNotFound, "camera not found")
	case r.Context().Err() != nil:
		// The client went away; there is no one to answer.
	default:
		logger.Error("camera lookup failed", "camera", name, "error", err)
		jsonError(w, http.StatusBadGateway, "mediamtx unavailable")
	}
	return false
}

// HealthHandler returns the status used by health checks, and the app time zone the UI
// uses for days and clock labels. It is public because the UI needs it before login.
func HealthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, r, map[string]string{"status": "success", "timezone": time.Local.String()})
}

// AuthHandler returns success when the authentication cookie is valid.
func AuthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	io.WriteString(w, `{"status":"success"}`)
}

// LoginHandler sets the authentication cookie after validating credentials.
func LoginHandler(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 4<<10)
	_ = r.ParseForm()
	u, pw := r.FormValue("username"), r.FormValue("password")
	p, err := auth.GetPasswd()
	if err != nil {
		logger.Error("password file unreadable", "error", err)
		jsonError(w, http.StatusInternalServerError, "login failed")
		return
	}
	if u == "" || pw == "" || !p.Match(u, pw) {
		logger.Info("login rejected", "username", u, "remote_addr", r.RemoteAddr)
		http.Error(w, "login failed", http.StatusUnauthorized)
		return
	}
	if err = auth.SetCookie(w, u); err != nil {
		logger.Error("auth cookie failed", "username", u, "error", err)
		http.Error(w, "login failed", http.StatusUnauthorized)
		return
	}
	logger.Info("login", "username", u, "remote_addr", r.RemoteAddr)
	w.Header().Set("Content-Type", "application/json")
	io.WriteString(w, `{"status":"success"}`)
}

// LogoutHandler clears the authentication cookie.
func LogoutHandler(w http.ResponseWriter, r *http.Request) {
	_ = auth.DeleteCookie(w)
	w.Header().Set("Content-Type", "application/json")
	io.WriteString(w, `{"status":"success"}`)
}

// CamerasHandler returns the available cameras.
func CamerasHandler(w http.ResponseWriter, r *http.Request) {
	cs, err := cameras.GetAll(r.Context())
	if err != nil {
		if r.Context().Err() == nil {
			logger.Error("camera list failed", "error", err)
			jsonError(w, http.StatusBadGateway, "mediamtx unavailable")
		}
		return
	}
	writeJSON(w, r, cs)
}

// CameraHandler returns a camera by name.
func CameraHandler(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["camera"]
	c, err := cameras.GetByName(r.Context(), name)
	switch {
	case err == nil:
		writeJSON(w, r, c)
	case errors.Is(err, cameras.ErrNotFound):
		jsonError(w, http.StatusNotFound, "camera not found")
	case r.Context().Err() == nil:
		logger.Error("camera lookup failed", "camera", name, "error", err)
		jsonError(w, http.StatusBadGateway, "mediamtx unavailable")
	}
}

// LiveStreamHandler proxies an HLS live stream from MediaMTX.
func LiveStreamHandler(w http.ResponseWriter, r *http.Request) {
	if !requireCamera(w, r) {
		return
	}
	camera := mux.Vars(r)["camera"]
	suffix := strings.TrimPrefix(r.URL.Path, "/cameras/"+camera+"/live/")
	for _, part := range strings.Split(suffix, "/") {
		if part == ".." {
			jsonError(w, http.StatusBadRequest, "invalid path")
			return
		}
	}
	target := mediamtx.HLSURL(camera, suffix, r.URL.Query())
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, target, nil)
	if err != nil {
		logger.Error("live proxy request invalid", "camera", camera, "path", suffix, "error", err)
		jsonError(w, http.StatusBadGateway, "stream unavailable")
		return
	}
	req.Header.Set("User-Agent", r.Header.Get("User-Agent"))
	// No client timeout: low-latency HLS holds playlist requests open until new parts exist.
	// Redirects are followed only back to MediaMTX, which answers the first playlist with one.
	client := &http.Client{CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if req.URL.Host != mediamtx.HLSHost() || len(via) >= 3 {
			return http.ErrUseLastResponse
		}
		return nil
	}}
	resp, err := client.Do(req)
	if err != nil {
		if r.Context().Err() == nil {
			logger.Error("live proxy failed", "camera", camera, "path", suffix, "error", err)
			jsonError(w, http.StatusBadGateway, "stream unavailable")
		}
		return
	}
	defer resp.Body.Close()
	// Upstream auth failures must not look like an expired login, and redirects
	// elsewhere are never handed to the browser.
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden || (resp.StatusCode >= 300 && resp.StatusCode < 400) {
		logger.Error("live proxy refused", "camera", camera, "path", suffix, "status", resp.StatusCode)
		jsonError(w, http.StatusBadGateway, "stream unavailable")
		return
	}
	if resp.StatusCode >= 500 {
		logger.Error("live proxy upstream error", "camera", camera, "path", suffix, "status", resp.StatusCode)
	}
	for _, key := range proxiedHeaders {
		if value := resp.Header.Get(key); value != "" {
			w.Header().Set(key, value)
		}
	}
	w.WriteHeader(resp.StatusCode)
	if _, err := io.Copy(w, resp.Body); err != nil && r.Context().Err() == nil {
		logger.Error("live proxy copy failed", "camera", camera, "path", suffix, "error", err)
	}
}
