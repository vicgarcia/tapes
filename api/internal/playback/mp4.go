// Package playback buffers MediaMTX clips for seekable HTTP delivery.
package playback

import (
	"context"
	"errors"
	"fmt"
	"io"
	"sync"
	"time"
)

// ErrFull indicates that a clip cannot fit within the cache's memory budget.
var ErrFull = errors.New("playback cache full")

// ErrEmpty indicates that the upstream returned no recorded media.
var ErrEmpty = errors.New("empty playback clip")

const chunkSize = 64 << 10

type entry struct {
	chunks          [][]byte
	size, allocated int64
	expires, used   time.Time
	refs            int
	retired         bool
	fetched         time.Time
	growing         bool
	etag            string
	duration        float64
}

// Cache bounds clip storage, including clips still being served or downloaded.
// Active clips and shared download results remain charged until readers release them.
type Cache struct {
	mu               sync.Mutex
	loading          map[string]*flight
	limit, allocated int64
	entries          map[string]*entry
}

// New creates a cache with the given byte budget.
func New(limit int64) *Cache {
	return &Cache{limit: limit, entries: make(map[string]*entry), loading: make(map[string]*flight)}
}

type flight struct {
	done    chan struct{}
	waiters int
	entry   *entry
	err     error
}

// Clip holds a cache reference until Close is called.
type Clip struct {
	*io.SectionReader
	cache *Cache
	entry *entry
	once  sync.Once
}

// Close releases this reader's reference to the clip.
func (c *Clip) Close() error {
	c.once.Do(func() {
		c.cache.mu.Lock()
		defer c.cache.mu.Unlock()
		c.cache.release(c.entry)
	})
	return nil
}

// FetchedAt returns the time this version of the clip was fetched.
func (c *Clip) FetchedAt() time.Time { return c.entry.fetched }

// Growing reports whether this clip reached the live edge when fetched.
func (c *Clip) Growing() bool { return c.entry.growing }

// ETag identifies this particular fetched version, including after expiration.
func (c *Clip) ETag() string { return c.entry.etag }

// Duration returns the MP4 duration, or the requested duration if unavailable.
func (c *Clip) Duration() float64 { return c.entry.duration }

func (c *Cache) release(e *entry) {
	e.refs--
	if e.refs == 0 && e.retired {
		c.allocated -= e.allocated
	}
}

type chunkReader struct{ e *entry }

func (r chunkReader) ReadAt(p []byte, off int64) (int, error) {
	if off < 0 {
		return 0, errors.New("negative offset")
	}
	n := 0
	for len(p) > 0 && off < r.e.size {
		index, offset := off/chunkSize, off%chunkSize
		count := copy(p, r.e.chunks[index][offset:])
		p = p[count:]
		off += int64(count)
		n += count
	}
	if len(p) > 0 {
		return n, io.EOF
	}
	return n, nil
}

func (c *Cache) remove(key string, e *entry) {
	delete(c.entries, key)
	e.retired = true
	if e.refs == 0 {
		c.allocated -= e.allocated
	}
}
func (c *Cache) room(bytes int64) bool {
	for c.allocated+bytes > c.limit {
		var oldest *entry
		var key string
		for k, e := range c.entries {
			if e.refs == 0 && (oldest == nil || e.used.Before(oldest.used)) {
				oldest = e
				key = k
			}
		}
		if oldest == nil {
			return false
		}
		c.remove(key, oldest)
	}
	return true
}

// Get returns a clip, sharing in-flight downloads by key. Each caller can cancel
// its own wait without cancelling the independently timed download. The start
// and duration (in seconds) determine the live-edge lifetime on a miss.
// The open callback must honor the supplied download context.
func (c *Cache) Get(ctx context.Context, key string, start time.Time, duration float64, open func(context.Context) (io.ReadCloser, error)) (*Clip, error) {
	c.mu.Lock()
	if err := ctx.Err(); err != nil {
		c.mu.Unlock()
		return nil, err
	}
	now := time.Now()
	for k, e := range c.entries {
		if !now.Before(e.expires) {
			c.remove(k, e)
		}
	}
	if e := c.entries[key]; e != nil {
		clip := c.reader(e)
		c.mu.Unlock()
		return clip, nil
	}
	f := c.loading[key]
	if f == nil {
		f = &flight{done: make(chan struct{})}
		c.loading[key] = f
		go c.fetch(key, f, start, duration, open)
	}
	f.waiters++
	c.mu.Unlock()
	select {
	case <-f.done:
	case <-ctx.Done():
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	defer func() {
		f.waiters--
		if f.waiters == 0 && f.entry != nil {
			c.release(f.entry)
		}
	}()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if f.err != nil {
		return nil, f.err
	}
	return c.reader(f.entry), nil
}

func (c *Cache) fetch(key string, f *flight, start time.Time, duration float64, open func(context.Context) (io.ReadCloser, error)) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	e, err := c.download(ctx, start, duration, open)
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.loading, key)
	f.err = err
	if err == nil {
		// Pin the result until every current waiter acquires a reader or cancels.
		if f.waiters > 0 {
			e.refs++
		}
		f.entry = e
		c.entries[key] = e
	}
	close(f.done)
}

func (c *Cache) download(ctx context.Context, start time.Time, duration float64, open func(context.Context) (io.ReadCloser, error)) (*entry, error) {
	fetched := time.Now()
	growing := !start.Add(time.Duration(duration * float64(time.Second))).Before(fetched.Add(-10 * time.Second))
	ttl := time.Hour
	if growing {
		ttl = 15 * time.Second
	}
	body, err := open(ctx)
	if err != nil {
		return nil, err
	}
	defer body.Close()
	e := &entry{fetched: fetched, growing: growing, duration: duration}
	defer func() {
		if err != nil {
			c.mu.Lock()
			c.allocated -= e.allocated
			c.mu.Unlock()
		}
	}()
	for {
		// Probe EOF before reserving another chunk, including at the budget boundary.
		var first [1]byte
		_, err = io.ReadFull(body, first[:])
		if err == io.EOF {
			err = nil
			break
		}
		if err != nil {
			return nil, err
		}
		amount := int64(chunkSize)
		if c.limit < amount {
			amount = c.limit
		}
		c.mu.Lock()
		if amount <= 0 || !c.room(amount) {
			c.mu.Unlock()
			err = ErrFull
			return nil, err
		}
		c.allocated += amount
		e.allocated += amount
		c.mu.Unlock()
		b := make([]byte, int(amount))
		b[0] = first[0]
		var n int
		n, err = io.ReadFull(body, b[1:])
		n++
		e.chunks = append(e.chunks, b[:n])
		e.size += int64(n)
		if err == io.EOF || err == io.ErrUnexpectedEOF {
			err = nil
			break
		}
		if err != nil {
			return nil, err
		}
	}
	if e.size == 0 {
		err = ErrEmpty
		return nil, err
	}

	e.expires = time.Now().Add(ttl)
	e.etag = fmt.Sprintf(`"%x-%x"`, fetched.UnixNano(), e.size)
	if actual, parseErr := mp4Duration(chunkReader{e}, e.size); parseErr == nil {
		e.duration = actual
	}
	return e, nil
}

func (c *Cache) reader(e *entry) *Clip {
	e.refs++
	e.used = time.Now()
	return &Clip{SectionReader: io.NewSectionReader(chunkReader{e}, 0, e.size), cache: c, entry: e}
}
