//go:build !windows

package overlay

// setupWindowsTransparency is a no-op on non-Windows platforms.
// Transparency is handled by Ebiten's SetScreenTransparent on macOS/Linux.
func setupWindowsTransparency() error {
	return nil
}
