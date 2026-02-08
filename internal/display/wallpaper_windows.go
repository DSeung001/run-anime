//go:build windows

package display

import (
	"os"
	"path/filepath"

	"golang.org/x/sys/windows/registry"
)

// WallpaperPath returns the absolute path to the current wallpaper for the given display index.
// Windows typically has one wallpaper; index 0 is used. Reads from HKEY_CURRENT_USER\Control Panel\Desktop\Wallpaper.
func WallpaperPath(displayIndex int) (string, error) {
	if displayIndex != 0 {
		// Windows usually has a single wallpaper; return same as 0
		return WallpaperPath(0)
	}
	k, err := registry.OpenKey(registry.CURRENT_USER, `Control Panel\Desktop`, registry.QUERY_VALUE)
	if err != nil {
		return "", err
	}
	defer k.Close()
	path, _, err := k.GetStringValue("Wallpaper")
	if err != nil {
		return "", err
	}
	if path == "" {
		return "", nil
	}
	// Expand env vars (e.g. %USERPROFILE%)
	path = os.ExpandEnv(path)
	if !filepath.IsAbs(path) {
		path, _ = filepath.Abs(path)
	}
	if _, err := os.Stat(path); err != nil {
		return "", err
	}
	return path, nil
}
