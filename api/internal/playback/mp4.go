// Package playback buffers MediaMTX clips for seekable HTTP delivery.
package playback

import (
	"context"
	"errors"
	"io"
	"sync"
	"time"
)

// ErrFull indicates that a clip cannot fit within the cache's memory budget.
var ErrFull = errors.New("playback cache full")

const chunkSize = 64 << 10

type entry struct {
	chunks          [][]byte
	size, allocated int64
	expires, used   time.Time
	refs            int
}

// Cache bounds clip storage, including clips still being served or downloaded.
// Active clips cannot be evicted. Downloads are serialized to bound admission.
type Cache struct {
	mu               sync.Mutex
	loading          chan struct{}
	limit, allocated int64
	entries          map[string]*entry
}

// New creates a cache with the given byte budget.
func New(limit int64) *Cache {
	return &Cache{limit: limit, entries: make(map[string]*entry), loading: make(chan struct{}, 1)}
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
	c.once.Do(func() { c.cache.mu.Lock(); defer c.cache.mu.Unlock(); c.entry.refs-- })
	return nil
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

func (c *Cache) remove(key string, e *entry) { delete(c.entries, key); c.allocated -= e.allocated }
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

// Get returns a cached clip or buffers a new one with the supplied lifetime.
// open must honor ctx. No partial clip is retained after a failed download.
func (c *Cache) Get(ctx context.Context, key string, ttl time.Duration, open func(context.Context) (io.ReadCloser, error)) (*Clip, error) {
	// Cache hits and reader releases need not wait for another clip's download.
	c.mu.Lock()
	if e := c.entries[key]; e != nil && time.Now().Before(e.expires) {
		clip := c.reader(e)
		c.mu.Unlock()
		return clip, nil
	}
	c.mu.Unlock()
	select {
	case c.loading <- struct{}{}:
		defer func() { <-c.loading }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	c.mu.Lock()
	now := time.Now()
	for k, e := range c.entries {
		if !now.Before(e.expires) && e.refs == 0 {
			c.remove(k, e)
		}
	}
	if e := c.entries[key]; e != nil && now.Before(e.expires) {
		clip := c.reader(e)
		c.mu.Unlock()
		return clip, nil
	}
	if c.entries[key] != nil {
		c.mu.Unlock()
		return nil, ErrFull
	}
	c.mu.Unlock()
	body, err := open(ctx)
	if err != nil {
		return nil, err
	}
	defer body.Close()
	e := &entry{}
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
	c.mu.Lock()
	defer c.mu.Unlock()
	e.expires = time.Now().Add(ttl)
	c.entries[key] = e
	return c.reader(e), nil
}
func (c *Cache) reader(e *entry) *Clip {
	e.refs++
	e.used = time.Now()
	return &Clip{SectionReader: io.NewSectionReader(chunkReader{e}, 0, e.size), cache: c, entry: e}
}
