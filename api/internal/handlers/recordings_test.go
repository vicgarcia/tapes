package handlers

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/mux"

	"github.com/vicgarcia/tapes/internal/playback"
)

func recordingRequest(handler http.HandlerFunc, method, query string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, "/cameras/test/playback?"+query, nil)
	r = mux.SetURLVars(r, map[string]string{"camera": "test"})
	w := httptest.NewRecorder()
	handler(w, r)
	return w
}
func TestRecordings(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, p, ok := r.BasicAuth()
		if !ok || u != "tapes" || p != "secret" {
			t.Error("missing credentials")
		}
		if r.URL.Path != "/list" || r.URL.Query().Get("path") != "test" {
			t.Error(r.URL)
		}
		fmt.Fprint(w, `[{"start":"2026-01-01T00:00:00Z","duration":20},{"start":"2026-01-01T01:00:00Z","duration":10}]`)
	}))
	defer upstream.Close()
	t.Setenv("MEDIAMTX_PLAYBACK_URL", upstream.URL)
	t.Setenv("MEDIAMTX_PASS", "secret")
	w := recordingRequest(RecordingsHandler, "GET", "start=2026-01-01T00:00:05Z&end=2026-01-01T00:00:15Z")
	if w.Code != 200 || strings.TrimSpace(w.Body.String()) != `{"spans":[{"start":"2026-01-01T00:00:05.000Z","end":"2026-01-01T00:00:15.000Z","duration":10}]}` {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	for _, q := range []string{"", "start=bad&end=bad", "start=2026-01-01T00:00:00Z&end=2026-01-09T00:00:00Z", "start=2026-01-02T00:00:00Z&end=2026-01-01T00:00:00Z"} {
		if w := recordingRequest(RecordingsHandler, "GET", q); w.Code != 400 {
			t.Fatalf("%s: %d", q, w.Code)
		}
	}
}
func TestRecordingsEmptyAndFailure(t *testing.T) {
	for _, tc := range []struct {
		status int
		body   string
		want   int
	}{{404, `{"error":"no recording segments found for the given time range"}`, 200}, {404, `{"error":"unknown"}`, 502}, {500, "failure", 502}, {200, "[]", 200}} {
		t.Run(tc.body, func(t *testing.T) {
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(tc.status); fmt.Fprint(w, tc.body) }))
			defer s.Close()
			t.Setenv("MEDIAMTX_PLAYBACK_URL", s.URL)
			w := recordingRequest(RecordingsHandler, "GET", "start=2026-01-01T00:00:00Z&end=2026-01-02T00:00:00Z")
			if w.Code != tc.want || (tc.want == 200 && strings.TrimSpace(w.Body.String()) != `{"spans":[]}`) {
				t.Fatalf("%d %s", w.Code, w.Body)
			}
		})
	}
}
func TestPlayback(t *testing.T) {
	calls := 0
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/get" || r.URL.Query().Get("format") != "mp4" || r.Header.Get("Range") != "" {
			t.Error(r.URL)
		}
		if r.URL.Query().Get("start") == "2000-01-01T00:00:00Z" {
			w.WriteHeader(404)
			return
		}
		fmt.Fprint(w, "0123456789")
	}))
	defer s.Close()
	t.Setenv("MEDIAMTX_PLAYBACK_URL", s.URL)
	q := "start=2026-01-01T00:00:00Z&duration=10"
	r := httptest.NewRequest("GET", "/cameras/test/playback?"+q, nil)
	r = mux.SetURLVars(r, map[string]string{"camera": "test"})
	r.Header.Set("Range", "bytes=2-5")
	w := httptest.NewRecorder()
	PlaybackHandler(w, r)
	if w.Code != 206 || w.Body.String() != "2345" || w.Header().Get("Accept-Ranges") != "bytes" || w.Header().Get("X-Playback-Start") != "2026-01-01T00:00:00.000Z" || w.Header().Get("X-Playback-Duration") != "10" {
		t.Fatalf("%d %v %s", w.Code, w.Header(), w.Body)
	}
	w = recordingRequest(PlaybackHandler, "HEAD", q)
	if w.Code != 200 || w.Header().Get("Content-Length") != "10" || w.Body.Len() != 0 || calls != 1 {
		t.Fatalf("%d %v calls=%d", w.Code, w.Header(), calls)
	}
	w = recordingRequest(PlaybackHandler, "GET", "start=2000-01-01T00:00:00Z&duration=10")
	if w.Code != 404 {
		t.Fatal(w.Code)
	}
	for _, d := range []string{"0", "601", "NaN", "Inf", "bad"} {
		if w := recordingRequest(PlaybackHandler, "GET", "start=2026-01-01T00:00:00Z&duration="+d); w.Code != 400 {
			t.Fatal(d, w.Code)
		}
	}
}

func TestClipLifetime(t *testing.T) {
	now := time.Now()
	for _, tc := range []struct {
		age  time.Duration
		want time.Duration
	}{{20 * time.Second, time.Hour}, {15 * time.Second, 15 * time.Second}, {10 * time.Second, 15 * time.Second}} {
		if got := clipLifetime(now.Add(-tc.age), 5, now); got != tc.want {
			t.Fatalf("age %v: %v", tc.age, got)
		}
	}
}
func TestPlaybackFullAndUpstreamError(t *testing.T) {
	previous := clipCache
	defer func() { clipCache = previous }()
	c := playback.New(4)
	clipCache = func() *playback.Cache { return c }
	status := 200
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(status); fmt.Fprint(w, "too large") }))
	defer s.Close()
	t.Setenv("MEDIAMTX_PLAYBACK_URL", s.URL)
	q := "start=2026-01-01T00:00:00Z&duration=5"
	if w := recordingRequest(PlaybackHandler, "GET", q); w.Code != 503 {
		t.Fatal(w.Code)
	}
	status = 401
	if w := recordingRequest(PlaybackHandler, "GET", q); w.Code != 502 {
		t.Fatal(w.Code)
	}
}
