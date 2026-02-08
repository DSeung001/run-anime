package overlay

import (
	"log"
	"time"

	"RunAnime/internal/config"
	"RunAnime/internal/logger"
	"RunAnime/internal/sprite"

	"github.com/hajimehoshi/ebiten/v2"
	"github.com/hajimehoshi/ebiten/v2/ebitenutil"
	"github.com/shirou/gopsutil/v3/cpu"
)

const maxSpacesRetryFrames = 120

// Game implements ebiten.Game for the desktop overlay.
type Game struct {
	images          []*ebiten.Image
	frameIndex      int
	cpuUsage        float64
	counter         int
	lastCPUTime     time.Time
	cfg             *config.Config
	spacesApplied   bool
	spacesRetryLeft int
}

// Update runs each tick.
func (g *Game) Update() error {
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
	speed := 1 + int(g.cpuUsage/5)
	g.counter += speed
	if g.counter > 60 {
		g.frameIndex++
		if g.frameIndex >= len(g.images) {
			g.frameIndex = 0
		}
		g.counter = 0
	}
	return nil
}

// Draw renders the current frame.
func (g *Game) Draw(screen *ebiten.Image) {
	if len(g.images) > 0 {
		op := &ebiten.DrawImageOptions{}
		screen.DrawImage(g.images[g.frameIndex], op)
		return
	}
	// 스프라이트가 없을 때: 에러 방지 및 안내 문구 표시
	ebitenutil.DebugPrint(screen, "스프라이트를 웹 설정에서 추가해주세요\nhttp://localhost:8765")
}

const minOverlaySize = 128

// Layout returns the logical screen size. 0이 되지 않도록 최소값 보장.
func (g *Game) Layout(outsideWidth, outsideHeight int) (int, int) {
	w, h := minOverlaySize, minOverlaySize
	if g.cfg != nil && g.cfg.Overlay.Width > 0 && g.cfg.Overlay.Height > 0 {
		w, h = g.cfg.Overlay.Width, g.cfg.Overlay.Height
	}
	if w < minOverlaySize {
		w = minOverlaySize
	}
	if h < minOverlaySize {
		h = minOverlaySize
	}
	return w, h
}

// Run starts the overlay window and blocks until it exits.
func Run(cfg *config.Config) error {
	logger.Debug("overlay Run start", "spacesRetryFrames", maxSpacesRetryFrames)
	game := &Game{
		lastCPUTime:     time.Now(),
		images:          make([]*ebiten.Image, 0),
		cfg:             cfg,
		spacesRetryLeft: maxSpacesRetryFrames,
	}

	// 스프라이트는 config(웹에서 업로드·설정)에 등록된 것만 사용. 없으면 빈 오버레이(투명).
	if len(cfg.Sprites) > 0 {
		entry := &cfg.Sprites[0]
		if entry.Rows > 0 && entry.Cols > 0 {
			frames, err := sprite.FramesFromSheet(entry.Path, entry.Rows, entry.Cols)
			if err != nil {
				log.Printf("sprite sheet load %q: %v", entry.Path, err)
			} else {
				game.images = frames
			}
		} else {
			frames, err := sprite.FramesFromFiles([]string{entry.Path})
			if err != nil {
				log.Printf("sprite load %q: %v", entry.Path, err)
			} else {
				game.images = frames
			}
		}
	}

	w, h := cfg.Overlay.Width, cfg.Overlay.Height
	if w < minOverlaySize || h < minOverlaySize {
		w, h = minOverlaySize, minOverlaySize
	}
	ebiten.SetWindowDecorated(false)
	ebiten.SetScreenTransparent(true)
	ebiten.SetWindowFloating(true)
	ebiten.SetWindowSize(w, h)
	ebiten.SetWindowTitle("run-anime")

	return ebiten.RunGame(game)
}
