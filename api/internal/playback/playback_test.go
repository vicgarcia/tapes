package playback

import (
	"bytes"
	"context"
	"errors"
	"io"
	"strings"
	"sync"
	"testing"
	"time"
)

func source(data string) func(context.Context) (io.ReadCloser, error) {
	return func(context.Context) (io.ReadCloser, error) { return io.NopCloser(strings.NewReader(data)), nil }
}
func TestCacheSeekAndReuse(t *testing.T) {
	c := New(2 * chunkSize)
	calls := 0
	open := func(context.Context) (io.ReadCloser, error) {
		calls++
		return io.NopCloser(bytes.NewReader(bytes.Repeat([]byte("abc"), chunkSize))), nil
	}
	clip, err := c.Get(context.Background(), "a", time.Hour, open)
	// This three-chunk clip exceeds the budget, with no partial entry retained.
	if !errors.Is(err, ErrFull) || clip != nil || c.allocated != 0 {
		t.Fatalf("%v %v %d", clip, err, c.allocated)
	}
	open = source(strings.Repeat("x", chunkSize) + "tail")
	clip, err = c.Get(context.Background(), "a", time.Hour, open)
	if err != nil {
		t.Fatal(err)
	}
	defer clip.Close()
	clip.Seek(chunkSize-1, io.SeekStart)
	b, err := io.ReadAll(clip)
	if err != nil || string(b) != "xtail" {
		t.Fatalf("%q %v", b, err)
	}
	cached, err := c.Get(context.Background(), "a", time.Hour, func(context.Context) (io.ReadCloser, error) { t.Fatal("cache miss"); return nil, nil })
	if err != nil {
		t.Fatal(err)
	}
	cached.Close()
	if calls != 1 {
		t.Fatal(calls)
	}
}
func TestCachePinnedEvictionAndExpiry(t *testing.T) {
	c := New(chunkSize)
	a, err := c.Get(context.Background(), "a", time.Hour, source("a"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = c.Get(context.Background(), "b", time.Hour, source("b")); !errors.Is(err, ErrFull) {
		t.Fatal(err)
	}
	a.Close()
	a.Close()
	b, err := c.Get(context.Background(), "b", time.Hour, source("b"))
	if err != nil {
		t.Fatal(err)
	}
	b.Close()
	if c.entries["a"] != nil || c.allocated > c.limit {
		t.Fatal("eviction failed")
	}
	c.entries["b"].expires = time.Now().Add(-time.Second)
	b, err = c.Get(context.Background(), "b", time.Hour, source("new"))
	if err != nil {
		t.Fatal(err)
	}
	data, _ := io.ReadAll(b)
	b.Close()
	if string(data) != "new" {
		t.Fatal(string(data))
	}
}

type failedReader struct{}

func (failedReader) Read([]byte) (int, error) { return 0, errors.New("read failure") }
func (failedReader) Close() error             { return nil }
func TestCacheFailureAndConcurrentReaders(t *testing.T) {
	c := New(chunkSize)
	_, err := c.Get(context.Background(), "bad", time.Hour, func(context.Context) (io.ReadCloser, error) { return failedReader{}, nil })
	if err == nil || c.allocated != 0 || len(c.entries) != 0 {
		t.Fatal("retained failed clip")
	}
	var wg sync.WaitGroup
	for range 10 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			clip, err := c.Get(context.Background(), "a", time.Hour, source("abc"))
			if err != nil {
				t.Error(err)
				return
			}
			defer clip.Close()
			data, err := io.ReadAll(clip)
			if err != nil || string(data) != "abc" {
				t.Errorf("%q %v", data, err)
			}
		}()
	}
	wg.Wait()
}

func TestCacheHitAndCancellationDuringDownload(t *testing.T) {
	c := New(3 * chunkSize)
	a, err := c.Get(context.Background(), "a", time.Hour, source("a"))
	if err != nil {
		t.Fatal(err)
	}
	a.Close()
	started, finish, done := make(chan struct{}), make(chan struct{}), make(chan error, 1)
	go func() {
		clip, err := c.Get(context.Background(), "b", time.Hour, func(context.Context) (io.ReadCloser, error) {
			close(started)
			<-finish
			return io.NopCloser(strings.NewReader("b")), nil
		})
		if clip != nil {
			clip.Close()
		}
		done <- err
	}()
	<-started
	defer func() {
		close(finish)
		if err := <-done; err != nil {
			t.Error(err)
		}
	}()
	hit := make(chan error, 1)
	go func() {
		clip, err := c.Get(context.Background(), "a", time.Hour, source("wrong"))
		if clip != nil {
			clip.Close()
		}
		hit <- err
	}()
	select {
	case err := <-hit:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("hit blocked behind download")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := c.Get(ctx, "c", time.Hour, source("c")); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
}
