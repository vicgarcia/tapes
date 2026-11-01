package handlers

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
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
func TestMain(m *testing.M) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, `{"items":[{"name":"test"}]}`) }))
	os.Setenv("MEDIAMTX_API_URL", server.URL)
	code := m.Run()
	server.Close()
	os.Exit(code)
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
	if w.Code != 206 || w.Body.String() != "2345" || w.Header().Get("Accept-Ranges") != "bytes" || w.Header().Get("X-Playback-Start") != "2026-01-01T00:00:00.000Z" || w.Header().Get("X-Playback-Duration") != "10.000" {
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

func movie(version byte) []byte {
	payload := make([]byte, 20)
	if version == 1 {
		payload = make([]byte, 32)
	}
	payload[0] = version
	if version == 0 {
		binary.BigEndian.PutUint32(payload[12:], 1000)
		binary.BigEndian.PutUint32(payload[16:], 1250)
	} else {
		binary.BigEndian.PutUint32(payload[20:], 1000)
		binary.BigEndian.PutUint64(payload[24:], 1250)
	}
	box := func(kind string, data []byte) []byte {
		out := make([]byte, len(data)+8)
		binary.BigEndian.PutUint32(out, uint32(len(out)))
		copy(out[4:], kind)
		copy(out[8:], data)
		return out
	}
	return box("moov", box("mvhd", payload))
}

func TestPlaybackValidatorsAndDuration(t *testing.T) {
	previous := clipCache
	defer func() { clipCache = previous }()
	for _, version := range []byte{0, 1} {
		t.Run(fmt.Sprint(version), func(t *testing.T) {
			cache := playback.New(1 << 20)
			clipCache = func() *playback.Cache { return cache }
			data := movie(version)
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write(data) }))
			defer s.Close()
			t.Setenv("MEDIAMTX_PLAYBACK_URL", s.URL)
			for _, growing := range []bool{false, true} {
				start := "2000-01-01T00:00:00Z"
				policy := "private, max-age=3600"
				if growing {
					start = time.Now().UTC().Format(time.RFC3339Nano)
					policy = "private, no-cache"
				}
				query := "start=" + url.QueryEscape(start) + "&duration=60"
				request := func(etag, method string) *httptest.ResponseRecorder {
					r := httptest.NewRequest(method, "/cameras/test/playback?"+query, nil)
					r = mux.SetURLVars(r, map[string]string{"camera": "test"})
					if etag != "" {
						r.Header.Set("Range", "bytes=0-7")
						r.Header.Set("If-Range", etag)
					}
					w := httptest.NewRecorder()
					PlaybackHandler(w, r)
					return w
				}
				w := request("", "GET")
				etag := w.Header().Get("ETag")
				modified := w.Header().Get("Last-Modified")
				if w.Code != 200 || etag == "" || modified == "" || w.Header().Get("Cache-Control") != policy || w.Header().Get("X-Playback-Duration") != "1.250" {
					t.Fatalf("%d %v", w.Code, w.Header())
				}
				w = request(etag, "GET")
				if w.Code != 206 || w.Body.Len() != 8 {
					t.Fatalf("%d %s", w.Code, w.Body)
				}

				w = request(modified, "GET")
				if w.Code != 206 {
					t.Fatalf("matching If-Range date: %d", w.Code)
				}
				w = request(time.Unix(1, 0).UTC().Format(http.TimeFormat), "GET")
				if w.Code != 200 {
					t.Fatalf("stale If-Range date: %d", w.Code)
				}
				conditional := httptest.NewRequest("GET", "/cameras/test/playback?"+query, nil)
				conditional = mux.SetURLVars(conditional, map[string]string{"camera": "test"})
				conditional.Header.Set("If-None-Match", etag)
				w = httptest.NewRecorder()
				PlaybackHandler(w, conditional)
				if w.Code != 304 || w.Body.Len() != 0 {
					t.Fatalf("matching If-None-Match: %d", w.Code)
				}
				// Evict the stored version to model an expired growing clip's refetch.
				cache = playback.New(1 << 20)
				w = request(etag, "GET")
				if w.Code != 200 || w.Header().Get("ETag") == etag || !bytes.Equal(w.Body.Bytes(), data) {
					t.Fatalf("%d %v", w.Code, w.Header())
				}
				w = request("", "HEAD")
				if w.Code != 200 || w.Body.Len() != 0 || w.Header().Get("X-Playback-Duration") != "1.250" {
					t.Fatalf("%d %v", w.Code, w.Header())
				}
			}
		})
	}
}

func TestRecordingCameraErrors(t *testing.T) {
	for _, handler := range []http.HandlerFunc{RecordingsHandler, PlaybackHandler} {
		r := httptest.NewRequest("GET", "/?start=2026-01-01T00:00:00Z&end=2026-01-02T00:00:00Z&duration=5", nil)
		r = mux.SetURLVars(r, map[string]string{"camera": "unknown"})
		w := httptest.NewRecorder()
		handler(w, r)
		if w.Code != 404 || !strings.Contains(w.Body.String(), "camera not found") {
			t.Fatalf("%d %s", w.Code, w.Body)
		}
	}
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) }))
	defer s.Close()
	t.Setenv("MEDIAMTX_API_URL", s.URL)
	// Let the shared camera-discovery cache expire before exercising an outage.
	time.Sleep(2100 * time.Millisecond)
	for _, handler := range []http.HandlerFunc{RecordingsHandler, PlaybackHandler} {
		w := recordingRequest(handler, "GET", "start=2026-01-01T00:00:00Z&end=2026-01-02T00:00:00Z&duration=5")
		if w.Code != 502 {
			t.Fatalf("%d %s", w.Code, w.Body)
		}
	}
}

func TestEmptyPlayback(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer s.Close()
	t.Setenv("MEDIAMTX_PLAYBACK_URL", s.URL)
	w := recordingRequest(PlaybackHandler, "GET", "start=2026-01-01T00:00:00Z&duration=5")
	if w.Code != 404 {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}

func TestRecordingsPrecision(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `[{"start":"2026-01-01T00:00:00.001Z","duration":1.2345678}]`)
	}))
	defer s.Close()
	t.Setenv("MEDIAMTX_PLAYBACK_URL", s.URL)
	w := recordingRequest(RecordingsHandler, "GET", "start=2026-01-01T00:00:00Z&end=2026-01-02T00:00:00Z")
	var response struct {
		Spans []span `json:"spans"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if w.Code != 200 || w.Header().Get("Cache-Control") != "no-store" || len(response.Spans) != 1 || response.Spans[0].Duration != 1.235 {
		t.Fatalf("%d %v %s", w.Code, w.Header(), w.Body)
	}
}
