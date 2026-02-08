//go:build darwin

package display

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
)

// WallpaperPath returns the absolute path to the current desktop picture on macOS.
// Uses AppleScript (Finder); displayIndex is unused because Finder returns a single desktop picture.
func WallpaperPath(displayIndex int) (string, error) {
	script := `tell application "Finder" to get POSIX path of (get desktop picture as alias)`
	out, err := exec.Command("osascript", "-e", script).Output()
	if err != nil {
		return "", err
	}
	path := strings.TrimSpace(string(out))
	if path == "" {
		return "", fmt.Errorf("AppleScript returned empty path")
	}
	if _, err := os.Stat(path); err != nil {
		return "", err
	}
	return path, nil
}
