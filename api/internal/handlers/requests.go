package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/vicgarcia/tapes/internal/logger"
)

// statusWriter records the response status and size for the request log.
type statusWriter struct {
	http.ResponseWriter
	status int
	bytes  int64
}

func (w *statusWriter) WriteHeader(status int) {
	if w.status == 0 {
		w.status = status
	}
	w.ResponseWriter.WriteHeader(status)
}

func (w *statusWriter) Write(p []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	n, err := w.ResponseWriter.Write(p)
	w.bytes += int64(n)
	return n, err
}

// Unwrap lets http.ResponseController reach the underlying writer, for flushing.
func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

// liveDetail reports whether a request is one of the media playlists, parts or
// segments a live viewer fetches several times a second. Only the initial
// index.m3u8, sent once when someone starts watching, is worth an info line.
func liveDetail(r *http.Request) bool {
	return strings.HasPrefix(r.URL.Path, "/cameras/") && strings.Contains(r.URL.Path, "/live/") &&
		!strings.HasSuffix(r.URL.Path, "/live/index.m3u8")
}

// LogRequests logs every request once it completes, at info level except for
// successful live HLS detail, which goes to debug. Handlers log failure causes.
func LogRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		sw := &statusWriter{ResponseWriter: w}
		next.ServeHTTP(sw, r)
		if sw.status == 0 {
			// Nothing was written, which net/http answers as 200; a cancelled request writes nothing at all.
			sw.status = http.StatusOK
			if r.Context().Err() != nil {
				sw.status = 499
			}
		}
		attrs := []any{"method", r.Method, "path", r.URL.Path, "status", sw.status, "bytes", sw.bytes,
			"duration_ms", time.Since(started).Milliseconds(), "remote_addr", r.RemoteAddr}
		if r.URL.RawQuery != "" {
			attrs = append(attrs, "query", r.URL.RawQuery)
		}
		if liveDetail(r) && sw.status < 400 {
			logger.Debug("request", attrs...)
			return
		}
		logger.Info("request", attrs...)
	})
}
