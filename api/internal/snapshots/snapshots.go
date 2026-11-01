// Package snapshots captures and caches on-demand still frames from MediaMTX.
package snapshots

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/vicgarcia/tapes/internal/logger"
)

// ErrNoSnapshot means no successful frame has been captured.
var ErrNoSnapshot = errors.New("no snapshot available")

// Snapshot holds a JPEG and its capture time.
type Snapshot struct {
	JPEG []byte
	Time time.Time
}

// Grabber captures one frame, respecting context cancellation.
type Grabber func(context.Context, string) ([]byte, error)

type result struct {
	snapshot Snapshot
	at       time.Time
}

// Service shares grabs and keeps the last good frame for each camera.
// Callers must verify that a camera exists before calling Get.
type Service struct {
	grab    Grabber
	now     func() time.Time
	slots   chan struct{}
	mu      sync.Mutex
	cache   map[string]result
	pending map[string]chan struct{}
}

// New creates a service with at most two simultaneous grabs.
func New(grab Grabber) *Service {
	return &Service{grab: grab, now: time.Now, slots: make(chan struct{}, 2), cache: make(map[string]result), pending: make(map[string]chan struct{})}
}

// Get returns a five-second cached result, falling back to the last good frame.
// A canceled waiter does not cancel the shared grab for other requests.
func (s *Service) Get(ctx context.Context, camera string) (Snapshot, error) {
	s.mu.Lock()
	r, ok := s.cache[camera]
	age := s.now().Sub(r.at)
	if ok && age >= 0 && age < 5*time.Second {
		s.mu.Unlock()
		return available(r.snapshot)
	}
	done, running := s.pending[camera]
	if !running {
		done = make(chan struct{})
		s.pending[camera] = done
		go s.capture(camera, done)
	}
	s.mu.Unlock()
	select {
	case <-ctx.Done():
		return Snapshot{}, ctx.Err()
	case <-done:
		s.mu.Lock()
		snapshot := s.cache[camera].snapshot
		s.mu.Unlock()
		return available(snapshot)
	}
}

func available(snapshot Snapshot) (Snapshot, error) {
	if len(snapshot.JPEG) == 0 {
		return Snapshot{}, ErrNoSnapshot
	}
	return snapshot, nil
}

func (s *Service) capture(camera string, done chan struct{}) {
	// Queueing does not consume the ten-second process budget.
	s.slots <- struct{}{}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	jpeg, err := s.grab(ctx, camera)
	cancel()
	<-s.slots
	if err != nil {
		logger.Error("snapshot grab failed", "camera", camera, "error", err)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	r := s.cache[camera]
	r.at = s.now()
	if err == nil {
		r.snapshot = Snapshot{JPEG: jpeg, Time: r.at}
	}
	s.cache[camera] = r
	delete(s.pending, camera)
	close(done)
}
