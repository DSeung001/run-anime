package main

import (
	_ "image/png"
	"log"
	"time"

	"github.com/hajimehoshi/ebiten/v2"
	"github.com/hajimehoshi/ebiten/v2/ebitenutil"
	"github.com/shirou/gopsutil/v3/cpu"
)

// 게임 상태
type Game struct {
	images      []*ebiten.Image
	frameIndex  int
	cpuUsage    float64
	counter     int
	lastCPUTime time.Time
}

func (g *Game) Update() error {
	// 1. CPU 사용량 측정 (1초마다)
	if time.Since(g.lastCPUTime) > 1*time.Second {
		percent, _ := cpu.Percent(0, false)
		if len(percent) > 0 {
			g.cpuUsage = percent[0]
		}
		g.lastCPUTime = time.Now()
	}

	// 2. 속도 조절 로직
	// CPU 0% -> speed 1 (느림) / CPU 100% -> speed 20 (빠름)
	speed := 1 + int(g.cpuUsage/5)
	g.counter += speed

	// 프레임 변경 (60틱 기준)
	if g.counter > 60 {
		g.frameIndex++
		if g.frameIndex >= len(g.images) {
			g.frameIndex = 0
		}
		g.counter = 0
	}

	// [중요] 윈도우 위치 이동 로직이 필요하다면 여기에 추가해야 합니다.
	// (투명 창은 타이틀바가 없어서 마우스로 못 옮기기 때문)
	// 예: ebiten.SetWindowPosition(x, y)

	return nil
}

func (g *Game) Draw(screen *ebiten.Image) {
	// [중요] 배경을 별도 색으로 칠하지 않아야 투명하게 유지됩니다.
	// screen.Fill(color.White) <- 이런 거 절대 금지!

	op := &ebiten.DrawImageOptions{}

	// 필요시 이미지 크기 조정
	// op.GeoM.Scale(0.5, 0.5)

	if len(g.images) > 0 {
		screen.DrawImage(g.images[g.frameIndex], op)
	}

	// 디버그용 (완성 후 주석 처리)
	// ebitenutil.DebugPrint(screen, "CPU: "+fmt.Sprintf("%.0f%%", g.cpuUsage))
}

func (g *Game) Layout(outsideWidth, outsideHeight int) (int, int) {
	return 128, 128 // 윈도우 크기와 동일하게 설정
}

func main() {
	game := &Game{
		lastCPUTime: time.Now(),
		images:      make([]*ebiten.Image, 0),
	}

	// 1. 이미지 로드 (테스트용)
	// 실제 파일이 없다면 에러가 나므로, 파일이 있는지 꼭 확인하세요.
	// 프로젝트 폴더에 run_0.png, run_1.png ... 가 있어야 합니다.
	frames := []string{"run_0.png", "run_1.png"}

	for _, fname := range frames {
		img, _, err := ebitenutil.NewImageFromFile(fname)
		if err != nil {
			log.Printf("이미지 로드 실패: %v (빈 이미지 사용)", err)
			emptyImg := ebiten.NewImage(128, 128)
			game.images = append(game.images, emptyImg)
		} else {
			game.images = append(game.images, img)
		}
	}

	// 만약 이미지가 하나도 로드 안됐으면 기본 이미지 하나 생성
	if len(game.images) == 0 {
		game.images = append(game.images, ebiten.NewImage(128, 128))
	}

	// 2. 윈도우 투명 설정 (핵심 수정 사항)
	ebiten.SetWindowDecorated(false)  // 테두리 제거 (필수)
	ebiten.SetScreenTransparent(true) // 배경 투명 (필수 - 함수명 수정됨)

	ebiten.SetWindowFloating(true) // 항상 위에 표시 (선택)
	ebiten.SetWindowSize(128, 128) // 창 크기
	ebiten.SetWindowTitle("Desktop Pet")

	if err := ebiten.RunGame(game); err != nil {
		log.Fatal(err)
	}
}
