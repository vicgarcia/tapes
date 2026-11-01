package snapshots

import (
	"context"
	"fmt"
	"image"
	"image/jpeg"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestMain(m *testing.M) {
	if mode := os.Getenv("SNAPSHOT_HELPER"); mode != "" {
		want := []string{"-hide_banner", "-loglevel", "error", "-rtsp_transport", "tcp", "-i", "rtsp://example:8554/test; not a shell", "-frames:v", "1", "-c:v", "mjpeg", "-q:v", "5", "-f", "image2pipe", "pipe:1"}
		if !reflect.DeepEqual(os.Args[1:], want) {
			fmt.Fprintln(os.Stderr, "bad arguments")
			os.Exit(2)
		}
		switch mode {
		case "timeout":
			time.Sleep(time.Minute)
		case "oversize":
			_, _ = os.Stdout.Write(make([]byte, maxSnapshotBytes+1))
		case "invalid":
			fmt.Fprint(os.Stdout, "not a jpeg")
		case "failure":
			fmt.Fprintln(os.Stderr, "test failure")
			os.Exit(1)
		default:
			if err := jpeg.Encode(os.Stdout, image.NewRGBA(image.Rect(0, 0, 2, 2)), nil); err != nil {
				os.Exit(1)
			}
		}
		os.Exit(0)
	}
	os.Exit(m.Run())
}

func TestFFmpeg(t *testing.T) {
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	if err := os.Symlink(executable, filepath.Join(dir, "ffmpeg")); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir)
	for _, mode := range []string{"success", "invalid", "failure", "oversize", "timeout"} {
		t.Run(mode, func(t *testing.T) {
			t.Setenv("SNAPSHOT_HELPER", mode)
			timeout := 5 * time.Second
			if mode == "timeout" {
				timeout = 300 * time.Millisecond
			}
			ctx, cancel := context.WithTimeout(context.Background(), timeout)
			defer cancel()
			began := time.Now()
			data, err := FFmpeg("rtsp://example:8554/")(ctx, "test; not a shell")
			if mode == "success" {
				if err != nil {
					t.Fatal(err)
				}
				if err := validateJPEG(data); err != nil {
					t.Fatal(err)
				}
			} else if err == nil {
				t.Fatal("expected failure")
			}
			if mode == "oversize" && (err == nil || !strings.Contains(err.Error(), "exceeds")) {
				t.Fatalf("expected size limit error, got %v", err)
			}
			if mode == "timeout" && time.Since(began) > 2*time.Second {
				t.Fatal("process was not killed and waited promptly")
			}
		})
	}
}
