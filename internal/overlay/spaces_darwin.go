//go:build darwin

package overlay

import (
	"runtime"

	"RunAnime/internal/logger"

	"github.com/ebitengine/purego"
	"github.com/ebitengine/purego/objc"
)

const (
	// NSWindowCollectionBehaviorCanJoinAllSpaces: window appears on all spaces.
	nsWindowCollectionBehaviorCanJoinAllSpaces = 1
)

var (
	sel_sharedApplication     = objc.RegisterName("sharedApplication")
	sel_mainWindow            = objc.RegisterName("mainWindow")
	sel_keyWindow             = objc.RegisterName("keyWindow")
	sel_collectionBehavior    = objc.RegisterName("collectionBehavior")
	sel_setCollectionBehavior = objc.RegisterName("setCollectionBehavior:")
	sel_setIgnoresMouseEvents = objc.RegisterName("setIgnoresMouseEvents:")
	mainQueue                 uintptr
	dispatchAsync             func(queue, block uintptr)
)

func init() {
	logger.Debug("spaces_darwin init start")
	_, err := purego.Dlopen("/System/Library/Frameworks/AppKit.framework/AppKit", purego.RTLD_NOW|purego.RTLD_GLOBAL)
	if err != nil {
		logger.Debug("spaces_darwin init: AppKit Dlopen failed", "err", err)
		return
	}
	logger.Debug("spaces_darwin init: AppKit loaded")
	libdispatch, err := purego.Dlopen("/usr/lib/system/libdispatch.dylib", purego.RTLD_NOW|purego.RTLD_GLOBAL)
	if err != nil {
		logger.Debug("spaces_darwin init: libdispatch Dlopen failed", "err", err)
		return
	}
	logger.Debug("spaces_darwin init: libdispatch loaded")
	sym, err := purego.Dlsym(libdispatch, "_dispatch_main_q")
	if err != nil {
		logger.Debug("spaces_darwin init: Dlsym _dispatch_main_q failed", "err", err)
		return
	}
	mainQueue = sym
	logger.Debug("spaces_darwin init: mainQueue", "mainQueue", mainQueue)
	purego.RegisterLibFunc(&dispatchAsync, libdispatch, "dispatch_async")
	logger.Debug("spaces_darwin init: dispatch_async registered")
}

// runOnMainThread runs the Cocoa window setup on the main thread (required by AppKit).
func runOnMainThread() {
	logger.Debug("runOnMainThread entered")
	appClass := objc.GetClass("NSApplication")
	if appClass == 0 {
		logger.Debug("runOnMainThread: GetClass NSApplication == 0")
		return
	}
	app := objc.ID(appClass).Send(sel_sharedApplication)
	if app == 0 {
		logger.Debug("runOnMainThread: sharedApplication == 0")
		return
	}
	window := app.Send(sel_mainWindow)
	if window == 0 {
		window = app.Send(sel_keyWindow)
	}
	if window == 0 {
		logger.Debug("runOnMainThread: mainWindow and keyWindow both 0")
		return
	}
	// OR with existing collectionBehavior so we don't strip flags set by GLFW/Ebiten.
	current := objc.Send[uintptr](window, sel_collectionBehavior)
	window.Send(sel_setCollectionBehavior, current|nsWindowCollectionBehaviorCanJoinAllSpaces)
	window.Send(sel_setIgnoresMouseEvents, 1) // YES: click-through to windows behind
	logger.Debug("runOnMainThread: setCollectionBehavior and setIgnoresMouseEvents done")
}

// applyShowOnAllSpaces schedules the main window to appear on all macOS Spaces.
// Cocoa must run on the main thread; we dispatch from the game thread.
func applyShowOnAllSpaces() bool {
	var stack [128]byte
	n := runtime.Stack(stack[:], false)
	logger.Debug("applyShowOnAllSpaces entered", "caller", string(stack[:n]))

	if mainQueue == 0 || dispatchAsync == nil {
		logger.Debug("applyShowOnAllSpaces: dispatch not inited", "mainQueue", mainQueue, "dispatchAsync_nil", dispatchAsync == nil)
		return false
	}

	logger.Debug("applyShowOnAllSpaces: creating block")
	block := objc.NewBlock(func(_ objc.Block) {
		runOnMainThread()
	})
	// dispatch_async는 비동기이므로 블록을 Release하면 안 됨(메인에서 실행 전 해제 → SIGBUS).
	// 성공 시 한 번만 호출되므로 블록 1개만 유출.
	logger.Debug("applyShowOnAllSpaces: calling dispatch_async", "mainQueue", mainQueue, "block", uintptr(block))
	dispatchAsync(mainQueue, uintptr(block))
	logger.Debug("applyShowOnAllSpaces: dispatch_async returned")
	return true
}
