package logger

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"strings"

	"github.com/vicgarcia/tapes/internal/env"
)

var log *slog.Logger

// customHandler formats logs similar to mediamtx: timestamp level message key=value...
type customHandler struct {
	w     io.Writer
	level slog.Level
}

func (h *customHandler) Enabled(_ context.Context, level slog.Level) bool {
	return level >= h.level
}

func (h *customHandler) Handle(_ context.Context, r slog.Record) error {
	// format timestamp like mediamtx: 2025/11/11 03:59:26
	timestamp := r.Time.Format("2006/01/02 15:04:05")

	// format level as uppercase 3-letter abbreviation
	var levelStr string
	switch r.Level {
	case slog.LevelDebug:
		levelStr = "DBG"
	case slog.LevelInfo:
		levelStr = "INF"
	case slog.LevelWarn:
		levelStr = "WRN"
	case slog.LevelError:
		levelStr = "ERR"
	default:
		levelStr = "INF"
	}

	// build log line: timestamp level message key=value...
	buf := fmt.Sprintf("%s %s %s", timestamp, levelStr, r.Message)

	// append structured attributes as key=value pairs
	r.Attrs(func(a slog.Attr) bool {
		buf += fmt.Sprintf(" %s=%v", a.Key, a.Value)
		return true
	})

	buf += "\n"

	_, err := h.w.Write([]byte(buf))
	return err
}

func (h *customHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return h
}

func (h *customHandler) WithGroup(name string) slog.Handler {
	return h
}

func init() {
	// check if debug mode is enabled via DEBUG env var
	debug := strings.ToLower(env.GetWithDefault("DEBUG", "false"))
	debugEnabled := debug == "true" || debug == "1" || debug == "yes"

	// set log level
	level := slog.LevelInfo
	if debugEnabled {
		level = slog.LevelDebug
	}

	// create custom handler
	handler := &customHandler{
		w:     os.Stdout,
		level: level,
	}

	log = slog.New(handler)

	// set as default logger for any code using slog directly
	slog.SetDefault(log)
}

// Info logs an informational message
func Info(msg string, args ...any) {
	log.Info(msg, args...)
}

// Debug logs a debug message (only if DEBUG env var is enabled)
func Debug(msg string, args ...any) {
	log.Debug(msg, args...)
}

// Error logs an error message
func Error(msg string, args ...any) {
	log.Error(msg, args...)
}
