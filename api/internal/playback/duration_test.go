package playback

import (
	"bytes"
	"context"
	"encoding/binary"
	"io"
	"testing"
	"time"
)

func testBox(kind string, payload []byte, extended bool) []byte {
	head := 8
	if extended {
		head = 16
	}
	out := make([]byte, head+len(payload))
	copy(out[4:], kind)
	if extended {
		binary.BigEndian.PutUint32(out, 1)
		binary.BigEndian.PutUint64(out[8:], uint64(len(out)))
	} else {
		binary.BigEndian.PutUint32(out, uint32(len(out)))
	}
	copy(out[head:], payload)
	return out
}
func testMovie(version byte, scale uint32, duration uint64) []byte {
	data := make([]byte, 20)
	if version == 1 {
		data = make([]byte, 32)
	}
	data[0] = version
	if version == 1 {
		binary.BigEndian.PutUint32(data[20:], scale)
		binary.BigEndian.PutUint64(data[24:], duration)
	} else {
		binary.BigEndian.PutUint32(data[12:], scale)
		binary.BigEndian.PutUint32(data[16:], uint32(duration))
	}
	return append(testBox("mdat", []byte("media"), false), testBox("moov", testBox("mvhd", data, false), true)...)
}
func TestMP4Duration(t *testing.T) {
	for _, version := range []byte{0, 1} {
		data := testMovie(version, 1000, 1234)
		c := New(chunkSize)
		clip, err := c.Get(context.Background(), "clip", time.Now(), 60, func(context.Context) (io.ReadCloser, error) { return io.NopCloser(bytes.NewReader(data)), nil })
		if err != nil {
			t.Fatal(err)
		}
		if clip.Duration() != 1.234 {
			t.Fatal(clip.Duration())
		}
		clip.Close()
		for n := 0; n < len(data); n++ {
			if _, err := mp4Duration(bytes.NewReader(data[:n]), int64(n)); err == nil {
				t.Fatalf("accepted truncated MP4 at %d", n)
			}
		}
	}
}
func TestMP4InvalidDuration(t *testing.T) {
	for _, data := range [][]byte{nil, []byte("not mp4"), testMovie(0, 0, 1000), testMovie(1, 1000, 0), testMovie(2, 1000, 1000), testMovie(0, 1000, ^uint64(0)), testMovie(1, 1000, ^uint64(0)), testBox("moov", []byte{0, 0, 0, 2, 'm', 'v', 'h', 'd'}, false)} {
		if _, err := mp4Duration(bytes.NewReader(data), int64(len(data))); err == nil {
			t.Fatalf("accepted invalid MP4 %x", data)
		}
	}
}
func TestCacheLifetimes(t *testing.T) {
	for _, tc := range []struct {
		age     time.Duration
		growing bool
		ttl     time.Duration
	}{{time.Hour, false, time.Hour}, {14 * time.Second, true, 15 * time.Second}, {16 * time.Second, false, time.Hour}} {
		c := New(chunkSize)
		clip, err := c.Get(context.Background(), "clip", time.Now().Add(-tc.age), 5, source("abc"))
		if err != nil {
			t.Fatal(err)
		}
		delta := clip.entry.expires.Sub(clip.FetchedAt())
		if clip.Growing() != tc.growing || delta < tc.ttl || delta > tc.ttl+time.Second {
			t.Fatalf("age %v: growing %v ttl %v", tc.age, clip.Growing(), delta)
		}
		clip.Close()
	}
}
