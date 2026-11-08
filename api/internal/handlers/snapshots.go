package handlers

import (
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/mux"

	"github.com/vicgarcia/tapes/internal/env"
	"github.com/vicgarcia/tapes/internal/snapshots"
)

var snapshotService = sync.OnceValue(func() *snapshots.Service {
	return snapshots.New(snapshots.FFmpeg(env.GetString("MEDIAMTX_RTSP_URL", "rtsp://mediamtx:8554")))
})

// SnapshotHandler returns the camera's current or last good JPEG.
func SnapshotHandler(w http.ResponseWriter, r *http.Request) {
	serveSnapshot(w, r, snapshotService())
}

func serveSnapshot(w http.ResponseWriter, r *http.Request, service *snapshots.Service) {
	w.Header().Set("Cache-Control", "no-store")
	if !requireCamera(w, r) {
		return
	}
	snapshot, err := service.Get(r.Context(), mux.Vars(r)["camera"])
	if err != nil {
		jsonError(w, 404, "no snapshot available")
		return
	}
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("X-Snapshot-Time", snapshot.Time.UTC().Format(time.RFC3339Nano))
	_, _ = w.Write(snapshot.JPEG)
}
