package handlers

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gorilla/mux"

	"github.com/vicgarcia/tapes/internal/auth"
	"github.com/vicgarcia/tapes/internal/snapshots"
)

func TestSnapshot(t *testing.T) {
	for _, tc := range []struct {
		name   string
		fail   bool
		status int
	}{{"test", false, 200}, {"test", true, 404}, {"missing", false, 404}} {
		calls := 0
		service := snapshots.New(func(context.Context, string) ([]byte, error) {
			calls++
			if tc.fail {
				return nil, errors.New("offline")
			}
			return []byte("jpeg"), nil
		})
		r := mux.SetURLVars(httptest.NewRequest("GET", "/cameras/"+tc.name+"/snapshot", nil), map[string]string{"camera": tc.name})
		w := httptest.NewRecorder()
		serveSnapshot(w, r, service)
		if w.Code != tc.status || w.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("%s: %d %s", tc.name, w.Code, w.Body)
		}
		if tc.name == "missing" && calls != 0 {
			t.Fatal("grabbed unknown camera")
		}
		if tc.status == 200 {
			if w.Header().Get("Content-Type") != "image/jpeg" || w.Body.String() != "jpeg" {
				t.Fatal(w)
			}
			if _, err := time.Parse(time.RFC3339Nano, w.Header().Get("X-Snapshot-Time")); err != nil {
				t.Fatal(err)
			}
		}
	}
}

func TestSnapshotAuthentication(t *testing.T) {
	called := false
	handler := auth.ValidateAuth(func(w http.ResponseWriter, r *http.Request) { called = true })
	w := httptest.NewRecorder()
	handler(w, httptest.NewRequest("GET", "/cameras/test/snapshot", nil))
	if w.Code != 401 || called {
		t.Fatalf("%d called=%v", w.Code, called)
	}
}
