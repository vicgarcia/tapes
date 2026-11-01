package snapshots

import (
	"bytes"
	"context"
	"fmt"
	"image/jpeg"
	"os/exec"
	"strings"

	"github.com/vicgarcia/tapes/internal/logger"
)

const maxSnapshotBytes = 10 << 20

// FFmpeg returns a grabber reading one JPEG from the given RTSP base URL.
func FFmpeg(baseURL string) Grabber {
	return func(ctx context.Context, camera string) ([]byte, error) {
		ctx, cancel := context.WithCancel(ctx)
		defer cancel()
		cmd := exec.CommandContext(ctx, "ffmpeg", "-hide_banner", "-loglevel", "error", "-rtsp_transport", "tcp", "-i", strings.TrimRight(baseURL, "/")+"/"+camera, "-frames:v", "1", "-c:v", "mjpeg", "-q:v", "5", "-f", "image2pipe", "pipe:1")
		stdout := &limitedBuffer{limit: maxSnapshotBytes, cancel: cancel}
		stderr := &limitedBuffer{limit: 64 << 10}
		cmd.Stdout, cmd.Stderr = stdout, stderr
		err := cmd.Run() // Run always waits, including after CommandContext kills ffmpeg.
		if err == nil {
			err = validateJPEG(stdout.buffer.Bytes())
		}
		if stdout.overflow {
			err = fmt.Errorf("snapshot exceeds %d bytes", maxSnapshotBytes)
		}
		if err != nil {
			// Do not expose RTSP credentials if ffmpeg includes its input URL.
			diagnostic := strings.ReplaceAll(stderr.buffer.String(), strings.TrimRight(baseURL, "/"), "[rtsp]")
			logger.Error("ffmpeg snapshot failed", "camera", camera, "stderr", diagnostic)
			return nil, fmt.Errorf("ffmpeg snapshot: %w", err)
		}
		return stdout.buffer.Bytes(), nil
	}
}

// Keep Buffer named: embedding it would let io.Copy bypass Write via ReadFrom.
type limitedBuffer struct {
	buffer   bytes.Buffer
	limit    int
	overflow bool
	cancel   context.CancelFunc
}

func (b *limitedBuffer) Write(p []byte) (int, error) {
	n := len(p)
	remaining := b.limit - b.buffer.Len()
	if len(p) > remaining {
		p = p[:remaining]
		b.overflow = true
		if b.cancel != nil {
			b.cancel()
		}
	}
	_, _ = b.buffer.Write(p)
	return n, nil
}

func validateJPEG(data []byte) error {
	if !bytes.HasSuffix(data, []byte{0xff, 0xd9}) {
		return fmt.Errorf("incomplete JPEG")
	}
	if _, err := jpeg.DecodeConfig(bytes.NewReader(data)); err != nil {
		return fmt.Errorf("invalid JPEG: %w", err)
	}
	return nil
}
