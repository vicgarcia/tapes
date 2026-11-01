package playback

import (
	"encoding/binary"
	"errors"
	"io"
	"math"
)

var errMP4Duration = errors.New("MP4 duration unavailable")

// findBox scans a bounded box sequence without copying media payloads.
func findBox(r io.ReaderAt, start, end int64, kind string) (int64, int64, error) {
	for start < end {
		if end-start < 8 {
			return 0, 0, errMP4Duration
		}
		var header [16]byte
		if _, err := r.ReadAt(header[:8], start); err != nil {
			return 0, 0, err
		}
		size := uint64(binary.BigEndian.Uint32(header[:4]))
		head := int64(8)
		switch size {
		case 0:
			size = uint64(end - start)
		case 1:
			if end-start < 16 {
				return 0, 0, errMP4Duration
			}
			if _, err := r.ReadAt(header[8:], start+8); err != nil {
				return 0, 0, err
			}
			size = binary.BigEndian.Uint64(header[8:])
			head = 16
		}
		if size < uint64(head) || size > uint64(end-start) {
			return 0, 0, errMP4Duration
		}
		next := start + int64(size)
		if string(header[4:8]) == kind {
			return start + head, next, nil
		}
		start = next
	}
	return 0, 0, errMP4Duration
}

func mp4Duration(r io.ReaderAt, size int64) (float64, error) {
	start, end, err := findBox(r, 0, size, "moov")
	if err != nil {
		return 0, err
	}
	start, end, err = findBox(r, start, end, "mvhd")
	if err != nil {
		return 0, err
	}
	if end-start < 20 {
		return 0, errMP4Duration
	}
	var data [32]byte
	if _, err = r.ReadAt(data[:20], start); err != nil {
		return 0, err
	}
	var scale uint32
	var duration uint64
	switch data[0] {
	case 0:
		scale = binary.BigEndian.Uint32(data[12:16])
		duration = uint64(binary.BigEndian.Uint32(data[16:20]))
		if duration == math.MaxUint32 {
			return 0, errMP4Duration
		}
	case 1:
		if end-start < 32 {
			return 0, errMP4Duration
		}
		if _, err = r.ReadAt(data[20:], start+20); err != nil {
			return 0, err
		}
		scale = binary.BigEndian.Uint32(data[20:24])
		duration = binary.BigEndian.Uint64(data[24:32])
		if duration == math.MaxUint64 {
			return 0, errMP4Duration
		}
	default:
		return 0, errMP4Duration
	}
	if scale == 0 || duration == 0 {
		return 0, errMP4Duration
	}
	return float64(duration) / float64(scale), nil
}
