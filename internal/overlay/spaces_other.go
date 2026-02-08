//go:build !darwin

package overlay

// applyShowOnAllSpaces is a no-op on non-macOS; only darwin uses Spaces.
func applyShowOnAllSpaces() bool {
	return true
}
