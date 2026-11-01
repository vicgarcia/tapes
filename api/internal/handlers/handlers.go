package handlers

import (
	"encoding/json"
	"github.com/gorilla/mux"
	"github.com/vicgarcia/tapes/internal/auth"
	"github.com/vicgarcia/tapes/internal/cameras"
	"github.com/vicgarcia/tapes/internal/mediamtx"
	"io"
	"net/http"
	"net/url"
	"strings"
)

func jsonError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
func HealthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	io.WriteString(w, `{"status":"success"}`)
}
func AuthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	io.WriteString(w, `{"status":"success"}`)
}
func LoginHandler(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()
	p, e := auth.GetPasswd()
	if e != nil {
		jsonError(w, 500, "login failed")
		return
	}
	u, pw := r.FormValue("username"), r.FormValue("password")
	if u == "" || pw == "" || !p.Match(u, pw) {
		http.Error(w, "login failed", 401)
		return
	}
	if e = auth.SetCookie(w, u); e != nil {
		http.Error(w, "login failed", 401)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	io.WriteString(w, `{"status":"success"}`)
}
func LogoutHandler(w http.ResponseWriter, r *http.Request) {
	_ = auth.DeleteCookie(w)
	w.Header().Set("Content-Type", "application/json")
	io.WriteString(w, `{"status":"success"}`)
}
func CamerasHandler(w http.ResponseWriter, r *http.Request) {
	cs, e := cameras.GetAll()
	if e != nil {
		jsonError(w, 502, "mediamtx unavailable")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(cs)
}
func CameraHandler(w http.ResponseWriter, r *http.Request) {
	c, e := cameras.GetByName(mux.Vars(r)["camera"])
	if e != nil {
		if _, x := cameras.GetAll(); x != nil {
			jsonError(w, 502, "mediamtx unavailable")
		} else {
			jsonError(w, 404, "camera not found")
		}
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(c)
}
func LiveStreamHandler(w http.ResponseWriter, r *http.Request) {
	camera := mux.Vars(r)["camera"]
	if _, e := cameras.GetByName(camera); e != nil {
		jsonError(w, 404, "camera not found")
		return
	}
	suffix := strings.TrimPrefix(r.URL.Path, "/cameras/"+camera+"/live/")
	for _, part := range strings.Split(suffix, "/") {
		if part == ".." {
			jsonError(w, 400, "invalid path")
			return
		}
	}
	target := mediamtx.HLSURL(camera, suffix, r.URL.Query())
	req, e := http.NewRequestWithContext(r.Context(), http.MethodGet, target, nil)
	if e != nil {
		jsonError(w, 502, "stream unavailable")
		return
	}
	req.Header.Set("User-Agent", r.Header.Get("User-Agent"))
	client := &http.Client{Timeout: 0, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if req.URL.Host != mediamtx.HLSHost() {
			return http.ErrUseLastResponse
		}
		return nil
	}}
	resp, e := client.Do(req)
	if e != nil {
		jsonError(w, 502, "stream unavailable")
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		jsonError(w, 502, "stream unavailable")
		return
	}
	for k, v := range resp.Header {
		for _, x := range v {
			w.Header().Add(k, x)
		}
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

var _ = url.Values{}
