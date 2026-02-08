//go:build !darwin && !windows

package display

// WallpaperPath returns the absolute path to the current wallpaper image for the given display index.
// On unsupported platforms it returns ErrUnsupported.
func WallpaperPath(displayIndex int) (string, error) {
	return "", ErrUnsupported
}
