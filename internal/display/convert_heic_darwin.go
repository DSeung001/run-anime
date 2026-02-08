//go:build darwin

package display

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// ConvertToJPEGIfHEIC converts HEIC/HEIF to a temporary JPEG using sips and returns its path.
// Caller must call cleanup when done to remove the temp file. If path is not HEIC/HEIF, returns path and nil cleanup.
func ConvertToJPEGIfHEIC(path string) (jpegPath string, cleanup func(), err error) {
	ext := strings.ToLower(filepath.Ext(path))
	if ext != ".heic" && ext != ".heif" {
		return path, nil, nil
	}
	tmp, err := os.CreateTemp("", "runanime-wall-*.jpg")
	if err != nil {
		return "", nil, fmt.Errorf("create temp file: %w", err)
	}
	tmpPath := tmp.Name()
	tmp.Close()
	cmd := exec.Command("sips", "-s", "format", "jpeg", path, "--out", tmpPath)
	if out, runErr := cmd.CombinedOutput(); runErr != nil {
		os.Remove(tmpPath)
		return "", nil, fmt.Errorf("sips convert: %w (%s)", runErr, string(out))
	}
	cleanup = func() { os.Remove(tmpPath) }
	return tmpPath, cleanup, nil
}
