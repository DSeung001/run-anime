package storage

import (
	"bytes"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"image"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	"io"
	"os"
	"path/filepath"
	"strings"

	"crypto/rand"

	"golang.org/x/image/draw"
)

const (
	CategorySprites     = "sprites"
	CategoryBackgrounds = "backgrounds"
)

// Dir returns the OS-specific root directory for uploaded assets (runanime/uploads).
func Dir() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("user config dir: %w", err)
	}
	return filepath.Join(configDir, "runanime", "uploads"), nil
}

// CategoryDir returns Dir()/category (e.g. .../uploads/sprites).
func CategoryDir(category string) (string, error) {
	d, err := Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(d, category), nil
}

// RemoveUpload deletes the file at the given relative path (e.g. "backgrounds/bg-xxx.jpg")
// if it is under the uploads directory. Safe to call if the file is already gone.
func RemoveUpload(relativePath string) error {
	if relativePath == "" || strings.Contains(relativePath, "..") {
		return nil
	}
	dir, err := Dir()
	if err != nil {
		return err
	}
	path := filepath.Join(dir, filepath.FromSlash(relativePath))
	absDir, _ := filepath.Abs(dir)
	absPath, _ := filepath.Abs(path)
	if !strings.HasPrefix(absPath, absDir+string(filepath.Separator)) && absPath != absDir {
		return nil
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// EnsureDir creates the uploads root directory if it does not exist.
func EnsureDir() (string, error) {
	d, err := Dir()
	if err != nil {
		return "", err
	}
	return d, os.MkdirAll(d, 0755)
}

// EnsureCategoryDir creates Dir()/category and returns the path.
func EnsureCategoryDir(category string) (string, error) {
	dir, err := CategoryDir(category)
	if err != nil {
		return "", err
	}
	return dir, os.MkdirAll(dir, 0755)
}

// prefixForCategory returns the file prefix for a category (sprite, bg).
func prefixForCategory(category string) string {
	switch category {
	case CategorySprites:
		return "sprite"
	case CategoryBackgrounds:
		return "bg"
	default:
		return "file"
	}
}

// extFromMIME returns a normalized extension for common image MIME types.
func extFromMIME(mime string) string {
	mime = strings.TrimSpace(strings.ToLower(mime))
	switch {
	case strings.HasPrefix(mime, "image/png"):
		return ".png"
	case strings.HasPrefix(mime, "image/jpeg"), strings.HasPrefix(mime, "image/jpg"):
		return ".jpg"
	case strings.HasPrefix(mime, "image/gif"):
		return ".gif"
	case strings.HasPrefix(mime, "image/webp"):
		return ".webp"
	default:
		return ".png"
	}
}

// generateAssetFilename returns prefix-16hex.ext (e.g. sprite-a1b2c3d4e5f67890.png).
func generateAssetFilename(prefix, ext string) (string, error) {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("random name: %w", err)
	}
	return prefix + "-" + hex.EncodeToString(b) + ext, nil
}

// SaveBase64Image decodes a data URL and saves under the given category.
// Returns relative path "category/filename" (e.g. sprites/sprite-xxx.png).
func SaveBase64Image(dataURL string, category string) (string, error) {
	const prefixLen = 22
	if len(dataURL) < prefixLen || dataURL[:5] != "data:" {
		return "", fmt.Errorf("invalid data URL")
	}
	i := 0
	for i < len(dataURL) && dataURL[i] != ',' {
		i++
	}
	if i >= len(dataURL) {
		return "", fmt.Errorf("invalid data URL: no comma")
	}
	enc := dataURL[i+1:]
	ext := ".png"
	if len(dataURL) > 10 && dataURL[5:10] == "image/" {
		j := 11
		for j < len(dataURL) && dataURL[j] != ';' && dataURL[j] != ',' {
			j++
		}
		if j > 11 {
			ext = "." + dataURL[11:j]
			if ext == ".jpeg" {
				ext = ".jpg"
			}
		}
	}
	decoded, err := base64.StdEncoding.DecodeString(enc)
	if err != nil {
		return "", err
	}
	dir, err := EnsureCategoryDir(category)
	if err != nil {
		return "", err
	}
	prefix := prefixForCategory(category)
	name, err := generateAssetFilename(prefix, ext)
	if err != nil {
		return "", err
	}
	fullPath := filepath.Join(dir, name)
	if err := os.WriteFile(fullPath, decoded, 0644); err != nil {
		return "", err
	}
	return category + "/" + name, nil
}

// SaveUploadedFile reads an image from src and saves it under the given category.
// contentType should be image/png, image/jpeg, image/gif, or image/webp.
// Returns relative path "category/filename".
func SaveUploadedFile(src io.Reader, contentType, category string) (relativePath string, err error) {
	ext := extFromMIME(contentType)
	switch category {
	case CategorySprites, CategoryBackgrounds:
		// ok
	default:
		return "", fmt.Errorf("invalid category: %s", category)
	}
	dir, err := EnsureCategoryDir(category)
	if err != nil {
		return "", err
	}
	prefix := prefixForCategory(category)
	name, err := generateAssetFilename(prefix, ext)
	if err != nil {
		return "", err
	}
	fullPath := filepath.Join(dir, name)
	f, err := os.Create(fullPath)
	if err != nil {
		return "", err
	}
	defer f.Close()
	if _, err := io.Copy(f, src); err != nil {
		os.Remove(fullPath)
		return "", err
	}
	return category + "/" + name, nil
}

// SaveFromPath copies a file from the given absolute path into the category directory.
// Content type is inferred from file extension. Returns relative path "category/filename".
func SaveFromPath(absPath, category string) (string, error) {
	if category != CategorySprites && category != CategoryBackgrounds {
		return "", fmt.Errorf("invalid category: %s", category)
	}
	ext := strings.ToLower(filepath.Ext(absPath))
	mime := "image/png"
	switch ext {
	case ".jpg", ".jpeg":
		mime = "image/jpeg"
	case ".gif":
		mime = "image/gif"
	case ".webp":
		mime = "image/webp"
	case ".png":
		mime = "image/png"
	default:
		mime = "image/png"
	}
	f, err := os.Open(absPath)
	if err != nil {
		return "", err
	}
	defer f.Close()
	return SaveUploadedFile(f, mime, category)
}

const maxCompressPixels = 2560

// compressImageToMaxBytes decodes img, resizes and re-encodes as JPEG until size <= maxBytes.
func compressImageToMaxBytes(img image.Image, maxBytes int64) ([]byte, error) {
	bounds := img.Bounds()
	w, h := bounds.Dx(), bounds.Dy()
	if w <= 0 || h <= 0 {
		return nil, fmt.Errorf("invalid image size")
	}
	scale := 1.0
	if w > maxCompressPixels || h > maxCompressPixels {
		if w > h {
			scale = float64(maxCompressPixels) / float64(w)
		} else {
			scale = float64(maxCompressPixels) / float64(h)
		}
	}
	newW := int(float64(w)*scale + 0.5)
	newH := int(float64(h)*scale + 0.5)
	if newW < 1 {
		newW = 1
	}
	if newH < 1 {
		newH = 1
	}
	dst := image.NewRGBA(image.Rect(0, 0, newW, newH))
	draw.CatmullRom.Scale(dst, dst.Bounds(), img, bounds, draw.Over, nil)
	for quality := 88; quality >= 50; quality -= 10 {
		var buf bytes.Buffer
		if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: quality}); err != nil {
			return nil, err
		}
		if int64(buf.Len()) <= maxBytes {
			return buf.Bytes(), nil
		}
	}
	return nil, fmt.Errorf("image still over %d bytes after compress", maxBytes)
}

// ReadAndCompressToMaxBytes reads the image at absPath and returns its bytes and MIME type.
// If the file is larger than maxBytes, it is decoded, resized/compressed to fit, and returned as JPEG (no file is written).
func ReadAndCompressToMaxBytes(absPath string, maxBytes int64) ([]byte, string, error) {
	info, err := os.Stat(absPath)
	if err != nil {
		return nil, "", err
	}
	if info.Size() <= maxBytes {
		b, err := os.ReadFile(absPath)
		if err != nil {
			return nil, "", err
		}
		ext := strings.ToLower(filepath.Ext(absPath))
		mime := "image/jpeg"
		switch ext {
		case ".png":
			mime = "image/png"
		case ".gif":
			mime = "image/gif"
		}
		return b, mime, nil
	}
	f, err := os.Open(absPath)
	if err != nil {
		return nil, "", err
	}
	defer f.Close()
	img, _, err := image.Decode(f)
	if err != nil {
		return nil, "", fmt.Errorf("decode image: %w", err)
	}
	b, err := compressImageToMaxBytes(img, maxBytes)
	if err != nil {
		return nil, "", err
	}
	return b, "image/jpeg", nil
}

// SaveFromPathWithMaxSize saves a copy of the file at absPath under category.
// If the file size is greater than maxBytes, it is decoded, resized/compressed to fit within maxBytes, then saved as JPEG.
// If the file size is <= maxBytes, it is saved as-is (same as SaveFromPath).
func SaveFromPathWithMaxSize(absPath, category string, maxBytes int64) (string, error) {
	if category != CategorySprites && category != CategoryBackgrounds {
		return "", fmt.Errorf("invalid category: %s", category)
	}
	info, err := os.Stat(absPath)
	if err != nil {
		return "", err
	}
	if info.Size() <= maxBytes {
		return SaveFromPath(absPath, category)
	}
	f, err := os.Open(absPath)
	if err != nil {
		return "", err
	}
	defer f.Close()
	img, _, err := image.Decode(f)
	if err != nil {
		return "", fmt.Errorf("decode image: %w", err)
	}
	compressed, err := compressImageToMaxBytes(img, maxBytes)
	if err != nil {
		return "", err
	}
	dir, err := EnsureCategoryDir(category)
	if err != nil {
		return "", err
	}
	prefix := prefixForCategory(category)
	name, err := generateAssetFilename(prefix, ".jpg")
	if err != nil {
		return "", err
	}
	fullPath := filepath.Join(dir, name)
	if err := os.WriteFile(fullPath, compressed, 0644); err != nil {
		return "", err
	}
	return category + "/" + name, nil
}
