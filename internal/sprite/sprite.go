package sprite

import (
	"image"
	_ "image/png"
	"os"

	"github.com/hajimehoshi/ebiten/v2"
)

// FramesFromFiles loads a list of image files and returns them as Ebiten images.
// Used when not using a sprite sheet (row/col).
func FramesFromFiles(paths []string) ([]*ebiten.Image, error) {
	var out []*ebiten.Image
	for _, p := range paths {
		f, err := os.Open(p)
		if err != nil {
			return nil, err
		}
		img, _, err := image.Decode(f)
		f.Close()
		if err != nil {
			return nil, err
		}
		out = append(out, ebiten.NewImageFromImage(img))
	}
	return out, nil
}

// FramesFromSheet loads one image and slices it into frames by row x col.
func FramesFromSheet(path string, rows, cols int) ([]*ebiten.Image, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	img, _, err := image.Decode(f)
	if err != nil {
		return nil, err
	}
	sheet := ebiten.NewImageFromImage(img)
	w := sheet.Bounds().Dx()
	h := sheet.Bounds().Dy()
	frameW := w / cols
	frameH := h / rows
	var out []*ebiten.Image
	for row := 0; row < rows; row++ {
		for col := 0; col < cols; col++ {
			x := col * frameW
			y := row * frameH
			sub := sheet.SubImage(image.Rect(x, y, x+frameW, y+frameH))
			out = append(out, ebiten.NewImageFromImage(sub))
		}
	}
	return out, nil
}
