package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gorilla/mux"

	"github.com/vicgarcia/tapes/internal/env"
	"github.com/vicgarcia/tapes/internal/mediamtx"
	"github.com/vicgarcia/tapes/internal/playback"
)

const timestampFormat = "2006-01-02T15:04:05.000Z"

type span struct {
	Start    string  `json:"start"`
	End      string  `json:"end"`
	Duration float64 `json:"duration"`
}

// RecordingsHandler lists spans clipped to a window of at most seven days.
func RecordingsHandler(w http.ResponseWriter, r *http.Request) {
	start, e1 := time.Parse(time.RFC3339Nano, r.URL.Query().Get("start"))
	end, e2 := time.Parse(time.RFC3339Nano, r.URL.Query().Get("end"))
	if e1 != nil || e2 != nil || !end.After(start) || end.Sub(start) > 7*24*time.Hour {
		jsonError(w, 400, "invalid recording window (maximum 7 days)")
		return
	}
	rows, err := mediamtx.ListRecordings(r.Context(), mux.Vars(r)["camera"], start, end)
	if err != nil {
		jsonError(w, 502, "recordings unavailable")
		return
	}
	spans := make([]span, 0, len(rows))
	for _, row := range rows {
		if row.Duration <= 0 || math.IsNaN(row.Duration) || math.IsInf(row.Duration, 0) || row.Duration > float64(math.MaxInt64)/float64(time.Second) {
			continue
		}
		a, b := row.Start, row.Start.Add(time.Duration(row.Duration*float64(time.Second)))
		if a.Before(start) {
			a = start
		}
		if b.After(end) {
			b = end
		}
		if b.After(a) {
			spans = append(spans, span{a.UTC().Format(timestampFormat), b.UTC().Format(timestampFormat), b.Sub(a).Seconds()})
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(struct {
		Spans []span `json:"spans"`
	}{spans})
}

var clipCache = sync.OnceValue(func() *playback.Cache {
	mb := env.GetInt("PLAYBACK_CACHE_MB", 256)
	if mb <= 0 || int64(mb) > math.MaxInt64/(1<<20) {
		mb = 256
	}
	return playback.New(int64(mb) * (1 << 20))
})

// PlaybackHandler buffers MP4 clips before serving GET, HEAD and byte ranges.
func PlaybackHandler(w http.ResponseWriter, r *http.Request) {
	start, err := time.Parse(time.RFC3339Nano, r.URL.Query().Get("start"))
	duration, e := strconv.ParseFloat(r.URL.Query().Get("duration"), 64)
	if err != nil || e != nil || math.IsNaN(duration) || math.IsInf(duration, 0) || duration < 1 || duration > 600 {
		jsonError(w, 400, "invalid start or duration (1-600 seconds)")
		return
	}
	camera := mux.Vars(r)["camera"]
	d := strconv.FormatFloat(duration, 'f', -1, 64)
	ttl := clipLifetime(start, duration, time.Now())
	// JSON encoding keeps camera names and times unambiguous in the cache key.
	key, _ := json.Marshal([]string{mediamtx.PlaybackURL(), camera, start.UTC().Format(time.RFC3339Nano), d})
	clip, err := clipCache().Get(r.Context(), string(key), ttl, func(ctx context.Context) (io.ReadCloser, error) { return mediamtx.ReadClip(ctx, camera, start, d) })
	if err != nil {
		switch {
		case errors.Is(err, mediamtx.ErrNoRecording):
			jsonError(w, 404, "no recording at start")
		case errors.Is(err, playback.ErrFull):
			jsonError(w, 503, "playback cache full")
		default:
			jsonError(w, 502, "playback unavailable")
		}
		return
	}
	defer clip.Close()
	w.Header().Set("Content-Type", "video/mp4")
	w.Header().Set("X-Playback-Start", start.UTC().Format(timestampFormat))
	w.Header().Set("X-Playback-Duration", d)
	// Live-edge clips may change even when the URL is unchanged.
	w.Header().Set("Cache-Control", "private, no-store")
	http.ServeContent(w, r, "clip.mp4", time.Time{}, clip)
}

func clipLifetime(start time.Time, duration float64, now time.Time) time.Duration {
	if !start.Add(time.Duration(duration * float64(time.Second))).Before(now.Add(-10 * time.Second)) {
		return 15 * time.Second
	}
	return time.Hour
}
