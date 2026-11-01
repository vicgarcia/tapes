package snapshots

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/jpeg"
	"io"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestCacheAndFallback(t *testing.T) {
	now := time.Unix(100, 0)
	calls := 0
	service := New(func(context.Context, string) ([]byte, error) {
		calls++
		if calls > 1 {
			return nil, errors.New("offline")
		}
		return []byte("frame"), nil
	})
	service.now = func() time.Time { return now }
	first, err := service.Get(context.Background(), "test")
	if err != nil {
		t.Fatal(err)
	}
	for _, advance := range []time.Duration{4 * time.Second, time.Second, time.Second} {
		now = now.Add(advance)
		got, err := service.Get(context.Background(), "test")
		if err != nil || !got.Time.Equal(first.Time) || string(got.JPEG) != "frame" {
			t.Fatalf("fallback: %+v %v", got, err)
		}
	}
	if calls != 2 {
		t.Fatalf("got %d grabs", calls)
	}
	now = now.Add(5 * time.Second)
	_, _ = service.Get(context.Background(), "test")
	if calls != 3 {
		t.Fatal("failures must expire")
	}
}

func TestNoFrameCachesFailure(t *testing.T) {
	calls := 0
	service := New(func(context.Context, string) ([]byte, error) { calls++; return nil, errors.New("offline") })
	for i := 0; i < 2; i++ {
		if _, err := service.Get(context.Background(), "test"); !errors.Is(err, ErrNoSnapshot) {
			t.Fatal(err)
		}
	}
	if calls != 1 {
		t.Fatal(calls)
	}
}

func TestCollapsingAndConcurrency(t *testing.T) {
	entered := make(chan string, 10)
	release := make(chan struct{})
	var active, peak, calls atomic.Int32
	service := New(func(ctx context.Context, camera string) ([]byte, error) {
		calls.Add(1)
		n := active.Add(1)
		for old := peak.Load(); n > old && !peak.CompareAndSwap(old, n); old = peak.Load() {
		}
		entered <- camera
		select {
		case <-release:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
		active.Add(-1)
		return []byte("jpeg"), nil
	})
	var wg sync.WaitGroup
	for _, camera := range []string{"a", "a", "a", "b", "b", "c", "c", "d"} {
		wg.Add(1)
		go func(camera string) {
			defer wg.Done()
			if _, err := service.Get(context.Background(), camera); err != nil {
				t.Error(err)
			}
		}(camera)
	}
	for i := 0; i < 2; i++ {
		select {
		case <-entered:
		case <-time.After(time.Second):
			t.Fatal("grab did not start")
		}
	}
	select {
	case <-entered:
		t.Error("more than two grabs started")
	case <-time.After(50 * time.Millisecond):
	}
	close(release)
	wg.Wait()
	if calls.Load() != 4 || peak.Load() != 2 {
		t.Fatalf("calls=%d peak=%d", calls.Load(), peak.Load())
	}
}

func TestCanceledWaiterDoesNotCancelGrab(t *testing.T) {
	entered, release := make(chan struct{}), make(chan struct{})
	service := New(func(ctx context.Context, camera string) ([]byte, error) {
		deadline, ok := ctx.Deadline()
		if !ok || time.Until(deadline) > 10*time.Second {
			t.Error("missing ten-second timeout")
		}
		close(entered)
		<-release
		return []byte("jpeg"), ctx.Err()
	})
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { _, err := service.Get(ctx, "test"); done <- err }()
	<-entered
	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	close(release)
	if _, err := service.Get(context.Background(), "test"); err != nil {
		t.Fatal(err)
	}
}

func TestJPEGAndBounds(t *testing.T) {
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, image.NewRGBA(image.Rect(0, 0, 2, 2)), nil); err != nil {
		t.Fatal(err)
	}
	if err := validateJPEG(buf.Bytes()); err != nil {
		t.Fatal(err)
	}
	for _, data := range [][]byte{nil, []byte("not jpeg"), {0xff, 0xd8, 0xff, 0xd9}, buf.Bytes()[:buf.Len()-2]} {
		if validateJPEG(data) == nil {
			t.Fatal("accepted invalid JPEG")
		}
	}
	canceled := false
	b := &limitedBuffer{limit: 10, cancel: func() { canceled = true }}
	_, _ = io.Copy(b, io.LimitReader(strings.NewReader("01234567890"), 11))
	if b.buffer.Len() != 10 || !b.overflow || !canceled {
		t.Fatalf("unbounded buffer: %+v", b)
	}
}
