package overlay

import (
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/gif"
	_ "image/png"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"time"

	"RunAnime/internal/config"
	"RunAnime/internal/logger"
	"RunAnime/internal/settings"
	"RunAnime/internal/storage"

	"github.com/hajimehoshi/ebiten/v2"
	"github.com/shirou/gopsutil/v3/cpu"
)

const maxSpacesRetryFrames = 120

var needsReload atomic.Bool

// NotifySettingsChanged signals the overlay to reload settings on the next Update tick.
// Call this after saving settings (e.g. from the server) so the overlay reflects changes without restart.
func NotifySettingsChanged() {
	needsReload.Store(true)
}

// animeInstance holds loaded frames and per-frame timing for one anime on the overlay.
type animeInstance struct {
	frames         []*ebiten.Image
	frameDurations []int   // ms per frame
	frameIndex     int     // current frame
	elapsedMs      int64   // ms in current frame
	x, y, w, h     float64 // position and size in 0-1000 (per-mille of overlay size)
}

// Game implements ebiten.Game for the desktop overlay.
type Game struct {
	instances       []*animeInstance
	overlayW        int
	overlayH        int
	lastUpdate      time.Time
	cpuUsage        float64
	lastCPUTime     time.Time
	cfg             *config.Config
	spacesApplied   bool
	spacesRetryLeft int
	transparentImg  *ebiten.Image // Cached transparent image for clearing screen
}

// Update runs each tick.
func (g *Game) Update() error {
	if needsReload.Load() {
		needsReload.Store(false)
		// Dispose old instances' frames to free memory
		for _, oldInst := range g.instances {
			for _, frame := range oldInst.frames {
				if frame != nil {
					frame.Dispose()
				}
			}
		}
		instances, w, h := loadInstancesFromSettings()
		g.instances = instances
		if w >= minOverlaySize && h >= minOverlaySize {
			g.overlayW = w
			g.overlayH = h
			ebiten.SetWindowSize(w, h)
		}
	}
	if !g.spacesApplied && g.spacesRetryLeft > 0 {
		g.spacesRetryLeft--
		logger.Debug("overlay Update: trying applyShowOnAllSpaces", "retryLeft", g.spacesRetryLeft)
		ok := applyShowOnAllSpaces()
		if ok {
			g.spacesApplied = true
			logger.Debug("overlay Update: applyShowOnAllSpaces succeeded")
		}
	}
	if time.Since(g.lastCPUTime) > 1*time.Second {
		percent, _ := cpu.Percent(0, false)
		if len(percent) > 0 {
			g.cpuUsage = percent[0]
		}
		g.lastCPUTime = time.Now()
	}
	now := time.Now()
	deltaMs := now.Sub(g.lastUpdate).Milliseconds()
	// Allow larger deltaMs (up to 2000ms) to handle system delays
	// If deltaMs is too large, cap it to prevent animation from jumping too far
	if deltaMs > 0 {
		if deltaMs > 2000 {
			deltaMs = 2000
		}
		for _, inst := range g.instances {
			if len(inst.frames) == 0 || len(inst.frameDurations) == 0 {
				continue
			}
			dur := int64(inst.frameDurations[inst.frameIndex])
			if dur <= 0 {
				// Use minimum delay to ensure animation continues
				dur = 10
			}
			inst.elapsedMs += deltaMs
			oldFrameIndex := inst.frameIndex
			for inst.elapsedMs >= dur {
				inst.elapsedMs -= dur
				inst.frameIndex++
				if inst.frameIndex >= len(inst.frames) {
					inst.frameIndex = 0
				}
				if inst.frameIndex < len(inst.frameDurations) {
					dur = int64(inst.frameDurations[inst.frameIndex])
				}
				if dur <= 0 {
					// Use minimum delay to ensure animation continues
					dur = 10
				}
			}
			// Debug log when frame index changes
			if oldFrameIndex != inst.frameIndex {
				logger.Debug("GIF frame changed", "oldIndex", oldFrameIndex, "newIndex", inst.frameIndex, "totalFrames", len(inst.frames))
			}
		}
	}
	g.lastUpdate = now
	return nil
}

// Draw renders the current frame.
func (g *Game) Draw(screen *ebiten.Image) {
	if screen == nil {
		return
	}
	// Clear screen completely - fill with transparent color to remove previous frames
	screen.Clear()

	// Use cached transparent image or create/update it if size changed
	bounds := screen.Bounds()
	w, h := bounds.Dx(), bounds.Dy()
	if g.transparentImg == nil || g.transparentImg.Bounds().Dx() != w || g.transparentImg.Bounds().Dy() != h {
		if g.transparentImg != nil {
			g.transparentImg.Dispose()
		}
		g.transparentImg = ebiten.NewImage(w, h)
		g.transparentImg.Fill(color.RGBA{0, 0, 0, 0})
	}

	// Fill screen with transparent color to ensure previous frames are cleared
	op := &ebiten.DrawImageOptions{}
	screen.DrawImage(g.transparentImg, op)

	overlayW := float64(g.overlayW)
	overlayH := float64(g.overlayH)
	for _, inst := range g.instances {
		if len(inst.frames) == 0 {
			continue
		}
		frame := inst.frames[inst.frameIndex]
		if frame == nil {
			continue
		}
		op := &ebiten.DrawImageOptions{}
		// Position and size: x,y,w,h are in per-mille (0-1000) of overlay size
		px := inst.x * overlayW / 1000
		py := inst.y * overlayH / 1000
		pw := inst.w * overlayW / 1000
		ph := inst.h * overlayH / 1000
		bounds := frame.Bounds()
		fw := float64(bounds.Dx())
		fh := float64(bounds.Dy())
		if fw <= 0 || fh <= 0 {
			continue
		}
		op.GeoM.Scale(pw/fw, ph/fh)
		op.GeoM.Translate(px, py)
		screen.DrawImage(frame, op)
	}
}

const minOverlaySize = 128

// Layout returns the logical screen size.
func (g *Game) Layout(outsideWidth, outsideHeight int) (int, int) {
	w, h := g.overlayW, g.overlayH
	if w < minOverlaySize {
		w = minOverlaySize
	}
	if h < minOverlaySize {
		h = minOverlaySize
	}
	return w, h
}

func loadInstancesFromSettings() ([]*animeInstance, int, int) {
	s, err := settings.Load()
	if err != nil || s == nil {
		return nil, 0, 0
	}
	if len(s.Monitors) == 0 || len(s.Animes) == 0 {
		return nil, 0, 0
	}
	mon := s.Monitors[0]
	// Calculate overlay size based on all state positions
	// Find the maximum width and height needed to contain all states on this monitor
	overlayW := minOverlaySize
	overlayH := minOverlaySize
	for _, a := range s.Animes {
		if a.MonitorID != mon.ID {
			continue
		}
		// Check all states for this anime
		for _, state := range a.States {
			if state.SpritePath == "" {
				continue
			}
			// Use state position if available, otherwise use anime position
			x := state.X
			y := state.Y
			width := state.Width
			height := state.Height
			if x == 0 {
				x = a.X
			}
			if y == 0 {
				y = a.Y
			}
			if width == 0 {
				width = a.Width
			}
			if height == 0 {
				height = a.Height
			}
			// Calculate the rightmost and bottommost positions
			// X, Y, Width, Height are in per-mille (0-1000) of monitor size
			// Convert to pixels based on monitor size
			rightEdge := (x + width) * mon.Width / 1000
			bottomEdge := (y + height) * mon.Height / 1000
			if rightEdge > overlayW {
				overlayW = rightEdge
			}
			if bottomEdge > overlayH {
				overlayH = bottomEdge
			}
		}
	}
	if overlayW < minOverlaySize {
		overlayW = minOverlaySize
	}
	if overlayH < minOverlaySize {
		overlayH = minOverlaySize
	}
	uploadDir, err := storage.Dir()
	if err != nil {
		log.Printf("overlay storage dir: %v", err)
		return nil, overlayW, overlayH
	}
	var instances []*animeInstance
	for _, a := range s.Animes {
		if a.MonitorID != mon.ID {
			continue
		}
		if len(a.States) == 0 {
			continue
		}
		// Create an instance for each state with an image
		for _, state := range a.States {
			if state.SpritePath == "" {
				continue
			}
			rel := storage.RelPath(state.SpritePath)
			if rel == "" {
				continue
			}
			absPath := filepath.Join(uploadDir, filepath.FromSlash(rel))
			var frames []*ebiten.Image
			var durations []int
			// Check if file is actually a GIF by reading magic bytes
			isGIF := false
			ext := filepath.Ext(absPath)
			extLower := strings.ToLower(ext)
			if extLower == ".gif" {
				isGIF = true
			} else {
				// Check magic bytes to detect GIF even if extension is wrong
				f, err := os.Open(absPath)
				if err == nil {
					magic := make([]byte, 3)
					n, _ := f.Read(magic)
					f.Close()
					if n >= 3 && string(magic) == "GIF" {
						isGIF = true
					}
				}
			}
			if isGIF {
				// Use saved disposal information if available, otherwise extract from file
				var savedDisposal []byte
				if len(state.GIFDisposal) > 0 {
					savedDisposal = state.GIFDisposal
				}
				frames, durations, err = loadGIFFrames(absPath, savedDisposal)
			} else {
				frames, err = loadImageFrames([]string{absPath})
				if err == nil {
					// For non-GIF images, use default duration of 150ms for all frames
					durations = make([]int, len(frames))
					for i := range durations {
						durations[i] = 150
					}
				}
			}
			if err != nil {
				log.Printf("overlay image load %q: %v", absPath, err)
				continue
			}
			if len(frames) == 0 {
				continue
			}
			if len(durations) == 0 {
				// Fallback: if durations are empty, use default 150ms for all frames
				durations = make([]int, len(frames))
				for i := range durations {
					durations[i] = 150
				}
			}
			// Use state position if available, otherwise use anime position
			x := float64(state.X)
			y := float64(state.Y)
			w := float64(state.Width)
			h := float64(state.Height)
			if x == 0 {
				x = float64(a.X)
			}
			if y == 0 {
				y = float64(a.Y)
			}
			if w == 0 {
				w = float64(a.Width)
			}
			if h == 0 {
				h = float64(a.Height)
			}
			instances = append(instances, &animeInstance{
				frames:         frames,
				frameDurations: durations,
				frameIndex:     0,
				elapsedMs:      0,
				x:              x,
				y:              y,
				w:              w,
				h:              h,
			})
		}
	}
	return instances, overlayW, overlayH
}

// loadGIFFrames loads a GIF file and extracts all frames as ebiten.Image array.
// Returns frames and their durations in milliseconds.
// savedDisposal: If provided, use this instead of extracting from file (for performance).
func loadGIFFrames(path string, savedDisposal []byte) ([]*ebiten.Image, []int, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, nil, err
	}
	defer f.Close()

	gifImg, err := gif.DecodeAll(f)
	if err != nil {
		return nil, nil, err
	}

	if len(gifImg.Image) == 0 {
		return nil, nil, fmt.Errorf("GIF file contains no frames")
	}

	// Get canvas size from config or first frame
	canvasWidth := gifImg.Config.Width
	canvasHeight := gifImg.Config.Height
	if canvasWidth == 0 || canvasHeight == 0 {
		bounds := gifImg.Image[0].Bounds()
		canvasWidth = bounds.Dx()
		canvasHeight = bounds.Dy()
	}

	// Background color (transparent)
	bgColor := color.Transparent

	var frames []*ebiten.Image
	var durations []int

	// Default delay if not specified
	defaultDelay := 100 // 100ms default

	// Use saved disposal information if available, otherwise extract from GIF file
	disposals := savedDisposal
	if disposals == nil {
		disposals = gifImg.Disposal
	}

	// Create canvas for accumulating frames (only for DisposalNone)
	canvas := image.NewRGBA(image.Rect(0, 0, canvasWidth, canvasHeight))
	draw.Draw(canvas, canvas.Bounds(), &image.Uniform{bgColor}, image.Point{}, draw.Src)

	var previousCanvas *image.RGBA // For DisposalPrevious

	// Process each frame according to disposal method
	for i := range gifImg.Image {
		// Get disposal method from GIF file (0 = DisposalNone, 1 = DisposalBackground, 2 = DisposalPrevious)
		// If not specified, default is 0 (DisposalNone) according to GIF spec
		disposal := byte(0) // Default: DisposalNone (accumulate)
		if i < len(disposals) {
			disposal = disposals[i]
		}

		// Save current canvas state before handling disposal (for DisposalPrevious)
		var savedCanvas *image.RGBA
		if disposal == gif.DisposalPrevious {
			savedCanvas = image.NewRGBA(canvas.Bounds())
			draw.Draw(savedCanvas, canvas.Bounds(), canvas, image.Point{}, draw.Src)
		}

		// Handle disposal from previous frame (skip for first frame)
		if i > 0 {
			prevDisposal := byte(0) // Default: DisposalNone (accumulate)
			if i-1 < len(disposals) {
				prevDisposal = disposals[i-1]
			}

			switch prevDisposal {
			case gif.DisposalBackground:
				// Clear entire canvas with background (독립 프레임 방식)
				// 이전 프레임을 완전히 지워서 누적 방지
				draw.Draw(canvas, canvas.Bounds(), &image.Uniform{bgColor}, image.Point{}, draw.Src)
			case gif.DisposalPrevious:
				// Restore to state before previous frame
				if previousCanvas != nil {
					draw.Draw(canvas, canvas.Bounds(), previousCanvas, image.Point{}, draw.Src)
				} else {
					draw.Draw(canvas, canvas.Bounds(), &image.Uniform{bgColor}, image.Point{}, draw.Src)
				}
			case gif.DisposalNone:
				// Keep previous frame - do nothing (누적 방식)
				// 프레임이 누적되어 보임
			}
		}

		// Draw current frame onto canvas
		frameBounds := gifImg.Image[i].Bounds()
		draw.Draw(canvas, frameBounds, gifImg.Image[i], image.Point{}, draw.Over)

		// Update previousCanvas for next iteration if this frame uses DisposalPrevious
		if savedCanvas != nil {
			previousCanvas = savedCanvas
		}

		// Create a copy of the current canvas state as the frame
		frameImg := image.NewRGBA(canvas.Bounds())
		draw.Draw(frameImg, canvas.Bounds(), canvas, image.Point{}, draw.Src)
		frame := ebiten.NewImageFromImage(frameImg)
		frames = append(frames, frame)

		// Get delay for this frame (GIF delay is in 1/100th of a second)
		delay := defaultDelay
		if i < len(gifImg.Delay) && gifImg.Delay[i] > 0 {
			delay = gifImg.Delay[i] * 10 // Convert to milliseconds
		}
		if delay < 10 {
			delay = 10 // Minimum 10ms
		}
		durations = append(durations, delay)
	}

	logger.Debug("GIF loaded", "path", path, "frames", len(frames), "durations", durations)
	return frames, durations, nil
}

// loadImageFrames loads a list of image files and returns them as Ebiten images.
func loadImageFrames(paths []string) ([]*ebiten.Image, error) {
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

// Run starts the overlay window and blocks until it exits.
func Run(cfg *config.Config) error {
	logger.Debug("overlay Run start", "spacesRetryFrames", maxSpacesRetryFrames)
	instances, overlayW, overlayH := loadInstancesFromSettings()
	if overlayW < minOverlaySize {
		overlayW = minOverlaySize
	}
	if overlayH < minOverlaySize {
		overlayH = minOverlaySize
	}
	game := &Game{
		instances:       instances,
		overlayW:        overlayW,
		overlayH:        overlayH,
		lastUpdate:      time.Now(),
		lastCPUTime:     time.Now(),
		cfg:             cfg,
		spacesRetryLeft: maxSpacesRetryFrames,
	}

	ebiten.SetWindowDecorated(false)
	ebiten.SetScreenTransparent(true)
	ebiten.SetWindowFloating(true)
	ebiten.SetWindowSize(overlayW, overlayH)
	ebiten.SetWindowTitle("run-anime")

	// Setup Windows transparency after window is created
	// Try multiple times as window might not be ready immediately
	for i := 0; i < 10; i++ {
		if err := setupWindowsTransparency(); err == nil {
			// Window found and setup succeeded
			break
		}
		time.Sleep(50 * time.Millisecond)
	}

	return ebiten.RunGame(game)
}
