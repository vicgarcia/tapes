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
	clip, err := c.Get(context.Background(), "a", time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC), 10, open)
	// This three-chunk clip exceeds the budget, with no partial entry retained.
	if !errors.Is(err, ErrFull) || clip != nil || c.allocated != 0 {
		t.Fatalf("%v %v %d", clip, err, c.allocated)
	}
	open = source(strings.Repeat("x", chunkSize) + "tail")
	clip, err = c.Get(context.Background(), "a", time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC), 10, open)
	if err != nil {
		t.Fatal(err)
	}
	defer clip.Close()
	clip.Seek(chunkSize-1, io.SeekStart)
	b, err := io.ReadAll(clip)
	if err != nil || string(b) != "xtail" {
		t.Fatalf("%q %v", b, err)
	}
	cached, err := c.Get(context.Background(), "a", time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC), 10, func(context.Context) (io.ReadCloser, error) { t.Fatal("cache miss"); return nil, nil })
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
	a, err := c.Get(context.Background(), "a", time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC), 10, source("a"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = c.Get(context.Background(), "b", time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC), 10, source("b")); !errors.Is(err, ErrFull) {
		t.Fatal(err)
	}
	a.Close()
	a.Close()
	b, err := c.Get(context.Background(), "b", time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC), 10, source("b"))
	if err != nil {
		t.Fatal(err)
	}
	b.Close()
	if c.entries["a"] != nil || c.allocated > c.limit {
		t.Fatal("eviction failed")
	}
	c.entries["b"].expires = time.Now().Add(-time.Second)
	b, err = c.Get(context.Background(), "b", time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC), 10, source("new"))
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
	_, err := c.Get(context.Background(), "bad", time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC), 10, func(context.Context) (io.ReadCloser, error) { return failedReader{}, nil })
	if err == nil || c.allocated != 0 || len(c.entries) != 0 {
		t.Fatal("retained failed clip")
	}
	var wg sync.WaitGroup
	for range 10 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			clip, err := c.Get(context.Background(), "a", time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC), 10, source("abc"))
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
	a, err := c.Get(context.Background(), "a", time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC), 10, source("a"))
	if err != nil {
		t.Fatal(err)
	}
	a.Close()
	started, finish, done := make(chan struct{}), make(chan struct{}), make(chan error, 1)
	go func() {
		clip, err := c.Get(context.Background(), "b", time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC), 10, func(context.Context) (io.ReadCloser, error) {
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
		clip, err := c.Get(context.Background(), "a", time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC), 10, source("wrong"))
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
	if _, err := c.Get(ctx, "c", time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC), 10, source("c")); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
}

func TestExpiredActiveClipRemainsAccounted(t *testing.T) {
	c := New(2 * chunkSize)
	old, err := c.Get(context.Background(), "a", time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC), 10, source("old"))
	if err != nil {
		t.Fatal(err)
	}
	c.entries["a"].expires = time.Now().Add(-time.Second)
	fresh, err := c.Get(context.Background(), "a", time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC), 10, source("new"))
	if err != nil {
		t.Fatal(err)
	}
	if c.allocated != 2*chunkSize {
		t.Fatal(c.allocated)
	}
	for _, tc := range []struct {
		clip *Clip
		want string
	}{{old, "old"}, {fresh, "new"}} {
		data, err := io.ReadAll(tc.clip)
		if err != nil || string(data) != tc.want {
			t.Fatalf("%q %v", data, err)
		}
	}
	old.Close()
	fresh.Close()
	if c.allocated != chunkSize {
		t.Fatal(c.allocated)
	}
}
func TestEmptyClipIsNotCached(t *testing.T) {
	c := New(chunkSize)
	_, err := c.Get(context.Background(), "empty", time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC), 10, source(""))
	if !errors.Is(err, ErrEmpty) || len(c.entries) != 0 || c.allocated != 0 {
		t.Fatalf("%v %d", err, c.allocated)
	}
}

func TestDifferentClipsDownloadConcurrently(t *testing.T) {
	c := New(2 * chunkSize)
	started, finish, done := make(chan struct{}), make(chan struct{}), make(chan error, 1)
	go func() {
		clip, err := c.Get(context.Background(), "slow", time.Now(), 60, func(context.Context) (io.ReadCloser, error) {
			close(started)
			<-finish
			return io.NopCloser(strings.NewReader("slow")), nil
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
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	clip, err := c.Get(ctx, "fast", time.Now(), 60, source("fast"))
	if err != nil {
		t.Fatal(err)
	}
	clip.Close()
}

func TestCancelledWaiterDoesNotCancelSharedFetch(t *testing.T) {
	c := New(chunkSize)
	started, finish := make(chan struct{}), make(chan struct{})
	first, second := make(chan error, 1), make(chan error, 1)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() {
		clip, err := c.Get(ctx, "shared", time.Now(), 60, func(fetchCtx context.Context) (io.ReadCloser, error) {
			close(started)
			<-finish
			if _, ok := fetchCtx.Deadline(); !ok {
				t.Error("download has no timeout")
			}
			if err := fetchCtx.Err(); err != nil {
				return nil, err
			}
			return io.NopCloser(strings.NewReader("shared")), nil
		})
		if clip != nil {
			clip.Close()
		}
		first <- err
	}()
	<-started
	go func() {
		clip, err := c.Get(context.Background(), "shared", time.Now(), 60, func(context.Context) (io.ReadCloser, error) {
			t.Error("duplicate download")
			return nil, errors.New("duplicate")
		})
		if clip != nil {
			clip.Close()
		}
		second <- err
	}()
	deadline := time.After(time.Second)
	for {
		c.mu.Lock()
		waiters := c.loading["shared"].waiters
		c.mu.Unlock()
		if waiters == 2 {
			break
		}
		select {
		case <-deadline:
			close(finish)
			t.Fatal("second waiter did not join")
		case <-time.After(time.Millisecond):
		}
	}
	cancel()
	select {
	case err := <-first:
		if !errors.Is(err, context.Canceled) {
			t.Error(err)
		}
	case <-time.After(time.Second):
		t.Error("cancelled waiter blocked")
	}
	close(finish)
	if err := <-second; err != nil {
		t.Fatal(err)
	}
}

func TestClipMetadataPersistsWithCachedVersion(t *testing.T) {
	c := New(chunkSize)
	clip, err := c.Get(context.Background(), "live", time.Now(), 60, source("abc"))
	if err != nil {
		t.Fatal(err)
	}
	fetched, etag := clip.FetchedAt(), clip.ETag()
	clip.Close()
	clip, err = c.Get(context.Background(), "live", time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC), 10, source("wrong"))
	if err != nil {
		t.Fatal(err)
	}
	defer clip.Close()
	if !clip.Growing() || clip.FetchedAt() != fetched || clip.ETag() != etag || clip.Duration() != 60 {
		t.Fatal("cached metadata changed")
	}
}
