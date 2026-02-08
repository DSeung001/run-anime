package display

import (
	"fmt"

	"github.com/kbinani/screenshot"
)

// Display represents a physical monitor (from OS).
type Display struct {
	Index   int    `json:"index"`
	ID      string `json:"id"`
	Width   int    `json:"width"`
	Height  int    `json:"height"`
	Primary bool   `json:"primary"`
}

// List returns currently connected displays. ID is "display-0", "display-1", ...
func List() ([]Display, error) {
	n := screenshot.NumActiveDisplays()
	if n <= 0 {
		return nil, nil
	}
	out := make([]Display, 0, n)
	for i := 0; i < n; i++ {
		bounds := screenshot.GetDisplayBounds(i)
		w := bounds.Dx()
		h := bounds.Dy()
		if w <= 0 {
			w = 1920
		}
		if h <= 0 {
			h = 1080
		}
		out = append(out, Display{
			Index:   i,
			ID:      fmt.Sprintf("display-%d", i),
			Width:   w,
			Height:  h,
			Primary: i == 0,
		})
	}
	return out, nil
}
