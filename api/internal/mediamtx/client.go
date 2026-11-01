package mediamtx

import (
	"encoding/json"
	"fmt"
	"github.com/vicgarcia/tapes/internal/env"
	"net/http"
	"net/url"
	"strings"
)

type Track struct {
	Codec      string `json:"codec"`
	CodecProps *struct {
		Width  int `json:"width"`
		Height int `json:"height"`
	} `json:"codecProps"`
}
type Path struct {
	Name   string  `json:"name"`
	Ready  bool    `json:"ready"`
	Tracks []Track `json:"tracks2"`
}

func base(key, def string) string { return strings.TrimRight(env.GetWithDefault(key, def), "/") }
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
func HLSURL(camera, path string, q url.Values) string {
	u := base("MEDIAMTX_HLS_URL", "http://mediamtx:8888") + "/" + camera + "/" + path
	if len(q) > 0 {
		u += "?" + q.Encode()
	}
	return u
}
func HLSHost() string {
	u, _ := url.Parse(base("MEDIAMTX_HLS_URL", "http://mediamtx:8888"))
	return u.Host
}
func PlaybackURL() string { return base("MEDIAMTX_PLAYBACK_URL", "http://mediamtx:9996") }
