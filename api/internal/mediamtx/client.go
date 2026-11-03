package mediamtx

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/vicgarcia/tapes/internal/env"
)

// apiClient bounds control API calls, so a stalled MediaMTX fails requests instead of hanging them.
var apiClient = &http.Client{Timeout: 5 * time.Second}

// videoCodecs are the MediaMTX codec names that carry video.
var videoCodecs = map[string]bool{
	"AV1": true, "VP9": true, "VP8": true, "H265": true, "H264": true,
	"MPEG-4 Video": true, "MPEG-1/2 Video": true, "M-JPEG": true,
}

// Track describes a MediaMTX media track.
type Track struct {
	Codec      string `json:"codec"`
	CodecProps *struct {
		Width  int `json:"width"`
		Height int `json:"height"`
	} `json:"codecProps"`
}

// IsVideo reports whether the track carries video with known dimensions.
func (t Track) IsVideo() bool {
	return videoCodecs[t.Codec] && t.CodecProps != nil && t.CodecProps.Width > 0 && t.CodecProps.Height > 0
}

// Path describes a MediaMTX path returned by the control API.
type Path struct {
	Name   string  `json:"name"`
	Ready  bool    `json:"ready"`
	Tracks []Track `json:"tracks2"`
}

// base returns a configured MediaMTX URL without a trailing slash.
func base(key, def string) string { return strings.TrimRight(env.GetWithDefault(key, def), "/") }

// Paths returns the paths reported by the MediaMTX control API.
func Paths(ctx context.Context) ([]Path, error) {
	u := base("MEDIAMTX_API_URL", "http://mediamtx:9997") + "/v3/paths/list"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, fmt.Errorf("mediamtx paths request: %w", err)
	}
	req.SetBasicAuth(env.GetWithDefault("MEDIAMTX_USER", "tapes"), env.GetWithDefault("MEDIAMTX_PASS", ""))
	resp, err := apiClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("mediamtx paths: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("mediamtx paths: %s", resp.Status)
	}
	var result struct {
		Items []Path `json:"items"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 16<<20)).Decode(&result); err != nil {
		return nil, fmt.Errorf("mediamtx paths: %w", err)
	}
	return result.Items, nil
}

// HLSURL builds a MediaMTX HLS URL for a camera path and query.
func HLSURL(camera, path string, q url.Values) string {
	u := base("MEDIAMTX_HLS_URL", "http://mediamtx:8888") + "/" + camera + "/" + path
	if len(q) > 0 {
		u += "?" + q.Encode()
	}
	return u
}

// HLSHost returns the configured MediaMTX HLS host.
func HLSHost() string {
	u, _ := url.Parse(base("MEDIAMTX_HLS_URL", "http://mediamtx:8888"))
	return u.Host
}

// PlaybackURL returns the configured MediaMTX playback URL.
func PlaybackURL() string { return base("MEDIAMTX_PLAYBACK_URL", "http://mediamtx:9996") }
