//go:build !darwin

package display

// ConvertToJPEGIfHEIC returns the path unchanged and a nil cleanup on non-darwin.
func ConvertToJPEGIfHEIC(path string) (jpegPath string, cleanup func(), err error) {
	return path, nil, nil
}
