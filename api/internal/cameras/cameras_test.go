package cameras

import (
	"encoding/json"
	"testing"

	"github.com/vicgarcia/tapes/internal/mediamtx"
)

func TestCameraJSONFields(t *testing.T) {
	c := Camera{Name: "x", Online: true, Video: &Video{Codec: "H264", Width: 640, Height: 360}}
	if c.Name != "x" || !c.Online || c.Video.Width != 640 {
		t.Fatal(c)
	}
}

func path(t *testing.T, raw string) mediamtx.Path {
	t.Helper()
	var p mediamtx.Path
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestFromPathUsesFirstVideoTrack(t *testing.T) {
	c := fromPath(path(t, `{"name":"garage","ready":true,"tracks2":[
		{"codec":"MPEG-4 Audio","codecProps":{}},
		{"codec":"H265","codecProps":{"width":2560,"height":1440}}]}`))
	if c.Video == nil || c.Video.Codec != "H265" || c.Video.Width != 2560 || c.Video.Height != 1440 {
		t.Fatalf("video = %+v", c.Video)
	}
}

func TestFromPathWithoutUsableVideo(t *testing.T) {
	for name, raw := range map[string]string{
		"audio only":     `{"name":"a","ready":true,"tracks2":[{"codec":"Opus","codecProps":{}}]}`,
		"no dimensions":  `{"name":"a","ready":true,"tracks2":[{"codec":"H264","codecProps":{}}]}`,
		"no codec props": `{"name":"a","ready":true,"tracks2":[{"codec":"H264"}]}`,
		"offline":        `{"name":"a","ready":false,"tracks2":[{"codec":"H264","codecProps":{"width":640,"height":360}}]}`,
	} {
		if c := fromPath(path(t, raw)); c.Video != nil {
			t.Errorf("%s: video = %+v", name, c.Video)
		}
	}
}
