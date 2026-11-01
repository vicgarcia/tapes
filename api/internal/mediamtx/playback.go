package mediamtx

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/vicgarcia/tapes/internal/env"
)

// ErrNoRecording indicates that no media exists at the requested start.
var ErrNoRecording = errors.New("no recording")

// Recording describes a continuous recorded time span.
type Recording struct {
	Start    time.Time `json:"start"`
	Duration float64   `json:"duration"`
}

var playbackClient = &http.Client{Timeout: 2 * time.Minute, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}

func playbackRequest(ctx context.Context, endpoint string, q url.Values) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, PlaybackURL()+endpoint+"?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.SetBasicAuth(env.GetWithDefault("MEDIAMTX_USER", "tapes"), env.GetWithDefault("MEDIAMTX_PASS", ""))
	return playbackClient.Do(req)
}

// ListRecordings lists recording spans overlapping the requested window.
func ListRecordings(ctx context.Context, camera string, start, end time.Time) ([]Recording, error) {
	resp, err := playbackRequest(ctx, "/list", url.Values{"path": {camera}, "start": {start.Format(time.RFC3339Nano)}, "end": {end.Format(time.RFC3339Nano)}})
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		body, err := io.ReadAll(io.LimitReader(resp.Body, 4096))
		if err != nil {
			return nil, err
		}
		if strings.Contains(strings.ToLower(string(body)), "no recording segments") {
			return []Recording{}, nil
		}
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("mediamtx list: %s", resp.Status)
	}
	var spans []Recording
	err = json.NewDecoder(io.LimitReader(resp.Body, 16<<20)).Decode(&spans)
	return spans, err
}

// ReadClip opens an MP4 clip. The caller must close the returned body.
func ReadClip(ctx context.Context, camera string, start time.Time, duration string) (io.ReadCloser, error) {
	resp, err := playbackRequest(ctx, "/get", url.Values{"path": {camera}, "start": {start.Format(time.RFC3339Nano)}, "duration": {duration}, "format": {"mp4"}})
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		if resp.StatusCode == http.StatusNotFound {
			return nil, ErrNoRecording
		}
		return nil, fmt.Errorf("mediamtx get: %s", resp.Status)
	}
	return resp.Body, nil
}
