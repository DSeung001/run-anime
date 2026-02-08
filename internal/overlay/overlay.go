package overlay

import (
	"log"
	"path/filepath"
	"sync/atomic"
	"time"

	"RunAnime/internal/config"
	"RunAnime/internal/logger"
	"RunAnime/internal/settings"
	"RunAnime/internal/sprite"
	"RunAnime/internal/storage"

	"github.com/hajimehoshi/ebiten/v2"
	"github.com/hajimehoshi/ebiten/v2/ebitenutil"
	"github.com/shirou/gopsutil/v3/cpu"
)

const maxSpacesRetryFrames = 120

var needsReload atomic.Bool

// NotifySettingsChanged signals the overlay to reload settings on the next Update tick.
// Call this after saving settings (e.g. from the server) so the overlay reflects changes without restart.
func NotifySettingsChanged() {
	needsReload.Store(true)
}

// spriteInstance holds loaded frames and per-frame timing for one anime on the overlay.
type spriteInstance struct {
	frames         []*ebiten.Image
	frameDurations []int   // ms per frame
	frameIndex     int     // current frame
	elapsedMs      int64   // ms in current frame
	x, y, w, h     float64 // position and size in 0-1000 (per-mille of overlay size)
}

// Game implements ebiten.Game for the desktop overlay.
type Game struct {
	instances      []*spriteInstance
	overlayW       int
	overlayH       int
	lastUpdate     time.Time
	cpuUsage       float64
	lastCPUTime    time.Time
	cfg            *config.Config
	spacesApplied  bool
	spacesRetryLeft int
}

// Update runs each tick.
func (g *Game) Update() error {
	if needsReload.Load() {
		needsReload.Store(false)
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
	if deltaMs > 0 && deltaMs < 500 {
		for _, inst := range g.instances {
			if len(inst.frames) == 0 || len(inst.frameDurations) == 0 {
				continue
			}
			dur := int64(inst.frameDurations[inst.frameIndex])
			if dur <= 0 {
				dur = 150
			}
			inst.elapsedMs += deltaMs
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
					dur = 150
				}
			}
		}
	}
	g.lastUpdate = now
	return nil
}

// Draw renders the current frame.
func (g *Game) Draw(screen *ebiten.Image) {
	w := float64(g.overlayW)
	h := float64(g.overlayH)
	hasAny := false
	for _, inst := range g.instances {
		if len(inst.frames) == 0 {
			continue
		}
		hasAny = true
		frame := inst.frames[inst.frameIndex]
		if frame == nil {
			continue
		}
		op := &ebiten.DrawImageOptions{}
		// Position and size: x,y,w,h are in per-mille (0-1000) of overlay size
		px := inst.x * w / 1000
		py := inst.y * h / 1000
		pw := inst.w * w / 1000
		ph := inst.h * h / 1000
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
	if !hasAny {
		ebitenutil.DebugPrint(screen, "스프라이트를 웹 설정에서 추가해주세요\nhttp://localhost:8765")
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

func loadInstancesFromSettings() ([]*spriteInstance, int, int) {
	s, err := settings.Load()
	if err != nil || s == nil {
		return nil, 0, 0
	}
	if len(s.Monitors) == 0 || len(s.Animes) == 0 {
		return nil, 0, 0
	}
	mon := s.Monitors[0]
	overlayW := mon.Width
	overlayH := mon.Height
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
	var instances []*spriteInstance
	for _, a := range s.Animes {
		if a.MonitorID != mon.ID {
			continue
		}
		if len(a.States) == 0 {
			continue
		}
		state := &a.States[0]
		if state.SpritePath == "" {
			continue
		}
		rel := storage.RelPath(state.SpritePath)
		if rel == "" {
			continue
		}
		absPath := filepath.Join(uploadDir, filepath.FromSlash(rel))
		var frames []*ebiten.Image
		if state.Rows > 0 && state.Cols > 0 {
			frames, err = sprite.FramesFromSheet(absPath, state.Rows, state.Cols)
		} else {
			frames, err = sprite.FramesFromFiles([]string{absPath})
		}
		if err != nil {
			log.Printf("overlay sprite load %q: %v", absPath, err)
			continue
		}
		if len(frames) == 0 {
			continue
		}
		durations := state.FrameDurations
		if len(durations) != len(frames) {
			durations = make([]int, len(frames))
			for i := range durations {
				durations[i] = state.Duration
				if durations[i] <= 0 {
					durations[i] = 150
				}
			}
		}
		instances = append(instances, &spriteInstance{
			frames:         frames,
			frameDurations: durations,
			x:              float64(a.X),
			y:              float64(a.Y),
			w:              float64(a.Width),
			h:              float64(a.Height),
		})
	}
	return instances, overlayW, overlayH
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

	return ebiten.RunGame(game)
}
