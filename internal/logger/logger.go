// Package logger provides debug-oriented logging for run-anime.
// When RUNANIME_DEBUG=1, logs at Debug level are written to stderr and to runanime-debug.log (in current directory).
package logger

import (
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
)

var (
	debug    bool
	log      *slog.Logger
	file     *os.File
	initOnce sync.Once
)

func initLogger() {
	initOnce.Do(func() {
		debug = os.Getenv("RUNANIME_DEBUG") == "1"
		level := slog.LevelInfo
		if debug {
			level = slog.LevelDebug
		}

		opts := &slog.HandlerOptions{
			Level:     level,
			AddSource: true,
		}

		// 디버그 시: stderr + runanime-debug.log 둘 다에 동일한 Text 로그 출력
		var w io.Writer = os.Stderr
		if debug {
			dir, _ := os.Getwd()
			if dir == "" {
				dir = os.TempDir()
			}
			logPath := filepath.Join(dir, "runanime-debug.log")
			f, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
			if err == nil {
				file = f
				w = io.MultiWriter(os.Stderr, f)
			}
		}
		log = slog.New(slog.NewTextHandler(w, opts))
	})
}

// IsDebug returns whether debug logging is enabled (RUNANIME_DEBUG=1).
func IsDebug() bool {
	initLogger()
	return debug
}

// Debug logs at Debug level. Keys must be string; values can be any type.
func Debug(msg string, keyvals ...any) {
	initLogger()
	log.Debug(msg, keyvals...)
}

// Info logs at Info level.
func Info(msg string, keyvals ...any) {
	initLogger()
	log.Info(msg, keyvals...)
}

// Warn logs at Warn level.
func Warn(msg string, keyvals ...any) {
	initLogger()
	log.Warn(msg, keyvals...)
}

// Error logs at Error level.
func Error(msg string, keyvals ...any) {
	initLogger()
	log.Error(msg, keyvals...)
}

// Close closes the debug log file if one was opened. Call from main on exit if desired.
func Close() {
	if file != nil {
		_ = file.Close()
		file = nil
	}
}
