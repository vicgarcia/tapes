package cameras

import (
	"context"
	"errors"
	"sort"
	"sync"
	"time"

	"github.com/vicgarcia/tapes/internal/mediamtx"
)

// ErrNotFound is returned for a camera MediaMTX does not know.
var ErrNotFound = errors.New("camera not found")

// cacheTTL bounds how often the control API is queried; live segments check the camera often.
const cacheTTL = 2 * time.Second

// Video represents a camera's video track.
type Video struct {
	Codec  string `json:"codec"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}

// Camera represents a camera and its current stream status.
type Camera struct {
	Name   string `json:"name"`
	Online bool   `json:"online"`
	Video  *Video `json:"video"`
}

// The lock guards only the cache, never the control API call, so a slow
// MediaMTX can't queue every request behind one fetch.
var (
	mu     sync.Mutex
	cache  []Camera
	cached time.Time
)

// GetAll returns cameras reported by MediaMTX, sorted by name.
func GetAll(ctx context.Context) ([]Camera, error) {
	mu.Lock()
	if cache != nil && time.Since(cached) < cacheTTL {
		out := append([]Camera(nil), cache...)
		mu.Unlock()
		return out, nil
	}
	mu.Unlock()

	rows, err := mediamtx.Paths(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]Camera, 0, len(rows))
	for _, p := range rows {
		out = append(out, fromPath(p))
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })

	mu.Lock()
	cache, cached = out, time.Now()
	mu.Unlock()
	return append([]Camera(nil), out...), nil
}

// GetByName returns the camera with the given name, or ErrNotFound.
func GetByName(ctx context.Context, name string) (Camera, error) {
	all, err := GetAll(ctx)
	if err != nil {
		return Camera{}, err
	}
	for _, c := range all {
		if c.Name == name {
			return c, nil
		}
	}
	return Camera{}, ErrNotFound
}

// fromPath converts a MediaMTX path, taking dimensions from its first video track
// so an audio track listed first doesn't hide them.
func fromPath(p mediamtx.Path) Camera {
	c := Camera{Name: p.Name, Online: p.Ready}
	if !p.Ready {
		return c
	}
	for _, t := range p.Tracks {
		if t.IsVideo() {
			c.Video = &Video{Codec: t.Codec, Width: t.CodecProps.Width, Height: t.CodecProps.Height}
			break
		}
	}
	return c
}
