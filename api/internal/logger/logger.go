package logger

import (
	"log/slog"
	"os"
	"strings"

	"github.com/vicgarcia/tapes/internal/env"
)

var log *slog.Logger

func init() {
	// check if debug mode is enabled via DEBUG env var
	debug := strings.ToLower(env.GetWithDefault("DEBUG", "false"))
	debugEnabled := debug == "true" || debug == "1" || debug == "yes"

	// set log level
	level := slog.LevelInfo
	if debugEnabled {
		level = slog.LevelDebug
	}

	// create text handler with lowercase output to stdout
	opts := &slog.HandlerOptions{
		Level: level,
		ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
			// lowercase the level key
			if a.Key == slog.LevelKey {
				level := a.Value.Any().(slog.Level)
				a.Value = slog.StringValue(strings.ToLower(level.String()))
			}
			return a
		},
	}

	handler := slog.NewTextHandler(os.Stdout, opts)
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
