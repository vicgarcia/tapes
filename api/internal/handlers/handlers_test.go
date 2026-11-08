package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/mux"
)

func liveRequest(path string) *httptest.ResponseRecorder {
	r := httptest.NewRequest("GET", "/cameras/test/live/"+path, nil)
	r = mux.SetURLVars(r, map[string]string{"camera": "test"})
	w := httptest.NewRecorder()
	LiveStreamHandler(w, r)
	return w
}

func TestLiveProxyForwardsOnlyMediaHeaders(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("session") != "abc" {
			t.Errorf("query not forwarded: %q", r.URL.RawQuery)
		}
		w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
		w.Header().Set("Cache-Control", "max-age=1")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Set-Cookie", "upstream=1")
		w.Write([]byte("#EXTM3U\n"))
	}))
	defer upstream.Close()
	t.Setenv("MEDIAMTX_HLS_URL", upstream.URL)

	w := liveRequest("index.m3u8?session=abc")
	if w.Code != 200 || w.Body.String() != "#EXTM3U\n" {
		t.Fatalf("%d %q", w.Code, w.Body)
	}
	if w.Header().Get("Content-Type") != "application/vnd.apple.mpegurl" || w.Header().Get("Cache-Control") != "max-age=1" {
		t.Fatalf("media headers missing: %v", w.Header())
	}
	if w.Header().Get("Access-Control-Allow-Origin") != "" || w.Header().Get("Set-Cookie") != "" {
		t.Fatalf("upstream-only headers leaked: %v", w.Header())
	}
}

func TestLiveProxyRefusals(t *testing.T) {
	elsewhere := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("elsewhere")) }))
	defer elsewhere.Close()
	for name, handler := range map[string]http.HandlerFunc{
		"unauthorized": func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusUnauthorized) },
		"forbidden":    func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusForbidden) },
		"other host":   func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, elsewhere.URL, http.StatusFound) },
	} {
		t.Run(name, func(t *testing.T) {
			upstream := httptest.NewServer(handler)
			defer upstream.Close()
			t.Setenv("MEDIAMTX_HLS_URL", upstream.URL)
			w := liveRequest("index.m3u8")
			if w.Code != http.StatusBadGateway || w.Header().Get("Location") != "" || strings.Contains(w.Body.String(), "elsewhere") {
				t.Fatalf("%d %v %q", w.Code, w.Header(), w.Body)
			}
		})
	}
}

func TestLiveProxyFollowsSameHostRedirect(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("cookieCheck") == "" {
			http.Redirect(w, r, r.URL.Path+"?cookieCheck=1", http.StatusFound)
			return
		}
		w.Write([]byte("#EXTM3U\n"))
	}))
	defer upstream.Close()
	t.Setenv("MEDIAMTX_HLS_URL", upstream.URL)
	if w := liveRequest("index.m3u8"); w.Code != 200 || w.Body.String() != "#EXTM3U\n" {
		t.Fatalf("%d %q", w.Code, w.Body)
	}
}

func TestLiveProxyRejectsParentPaths(t *testing.T) {
	if w := liveRequest("../other/index.m3u8"); w.Code != http.StatusBadRequest {
		t.Fatalf("%d %q", w.Code, w.Body)
	}
}

func TestCameraHandlerNotFoundVersusUnavailable(t *testing.T) {
	r := mux.SetURLVars(httptest.NewRequest("GET", "/cameras/unknown", nil), map[string]string{"camera": "unknown"})
	w := httptest.NewRecorder()
	CameraHandler(w, r)
	if w.Code != http.StatusNotFound {
		t.Fatalf("%d %s", w.Code, w.Body)
	}

	down := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) }))
	defer down.Close()
	t.Setenv("MEDIAMTX_API_URL", down.URL)
	// Let the shared camera-discovery cache expire before exercising an outage.
	time.Sleep(2100 * time.Millisecond)
	w = httptest.NewRecorder()
	CameraHandler(w, r)
	if w.Code != http.StatusBadGateway {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}

func TestHealthReportsTimeZone(t *testing.T) {
	ny, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Fatal(err)
	}
	previous := time.Local
	time.Local = ny
	defer func() { time.Local = previous }()
	w := httptest.NewRecorder()
	HealthHandler(w, httptest.NewRequest("GET", "/health", nil))
	if w.Code != 200 || strings.TrimSpace(w.Body.String()) != `{"status":"success","timezone":"America/New_York"}` {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}

func TestLiveDetail(t *testing.T) {
	for path, want := range map[string]bool{
		"/cameras/garage/live/index.m3u8":         false,
		"/cameras/garage/live/video1_stream.m3u8": true,
		"/cameras/garage/live/part12.mp4":         true,
		"/cameras/garage/live/init.mp4":           true,
		"/cameras/garage/playback":                false,
		"/cameras/garage/snapshot":                false,
		"/cameras":                                false,
	} {
		if got := liveDetail(httptest.NewRequest("GET", path, nil)); got != want {
			t.Errorf("%s: %v, want %v", path, got, want)
		}
	}
}

func TestLogRequestsRecordsStatus(t *testing.T) {
	for name, tc := range map[string]struct {
		handler http.HandlerFunc
		status  int
	}{
		"explicit": {func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusTeapot) }, http.StatusTeapot},
		"implicit": {func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok")) }, http.StatusOK},
		"empty":    {func(w http.ResponseWriter, r *http.Request) {}, http.StatusOK},
	} {
		w := httptest.NewRecorder()
		var seen *statusWriter
		LogRequests(http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
			seen = rw.(*statusWriter)
			tc.handler(rw, r)
		})).ServeHTTP(w, httptest.NewRequest("GET", "/x", nil))
		if seen.status != tc.status || w.Code != tc.status {
			t.Errorf("%s: logged %d, sent %d, want %d", name, seen.status, w.Code, tc.status)
		}
	}
}
