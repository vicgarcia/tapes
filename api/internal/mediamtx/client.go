package mediamtx

import (
	"encoding/json"
	"fmt"
	"github.com/vicgarcia/tapes/internal/env"
	"net/http"
	"net/url"
	"strings"
)

// Track describes a MediaMTX video track.
// Track describes a MediaMTX video track.
type Track struct {
	Codec      string `json:"codec"`
	CodecProps *struct {
		Width  int `json:"width"`
		Height int `json:"height"`
	} `json:"codecProps"`
}

// Path describes a MediaMTX path returned by the control API.
// Path describes a MediaMTX path returned by the control API.
type Path struct {
	Name   string  `json:"name"`
	Ready  bool    `json:"ready"`
	Tracks []Track `json:"tracks2"`
}

// base returns a configured MediaMTX URL without a trailing slash.
// base returns a configured MediaMTX URL without a trailing slash.
func base(key, def string) string { return strings.TrimRight(env.GetWithDefault(key, def), "/") }

// Paths returns the paths reported by the MediaMTX control API.
// Paths returns the paths reported by the MediaMTX control API.
func Paths() ([]Path, error) {
	u := base("MEDIAMTX_API_URL", "http://mediamtx:9997") + "/v3/paths/list"
	req, _ := http.NewRequest("GET", u, nil)
	user := env.GetWithDefault("MEDIAMTX_USER", "tapes")
	pass := env.GetWithDefault("MEDIAMTX_PASS", "")
	req.SetBasicAuth(user, pass)
	resp, e := http.DefaultClient.Do(req)
	if e != nil {
		return nil, e
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("mediamtx returned %s", resp.Status)
	}
	var result struct {
		Items []Path `json:"items"`
	}
	e = json.NewDecoder(resp.Body).Decode(&result)
	return result.Items, e
}

// HLSURL builds a MediaMTX HLS URL for a camera path and query.
// HLSURL builds a MediaMTX HLS URL for a camera path and query.
func HLSURL(camera, path string, q url.Values) string {
	u := base("MEDIAMTX_HLS_URL", "http://mediamtx:8888") + "/" + camera + "/" + path
	if len(q) > 0 {
		u += "?" + q.Encode()
	}
	return u
}

// HLSHost returns the configured MediaMTX HLS host.
// HLSHost returns the configured MediaMTX HLS host.
func HLSHost() string {
	u, _ := url.Parse(base("MEDIAMTX_HLS_URL", "http://mediamtx:8888"))
	return u.Host
}

// PlaybackURL returns the configured MediaMTX playback URL.
// PlaybackURL returns the configured MediaMTX playback URL.
func PlaybackURL() string { return base("MEDIAMTX_PLAYBACK_URL", "http://mediamtx:9996") }
