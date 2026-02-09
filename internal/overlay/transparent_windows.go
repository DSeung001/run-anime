//go:build windows

package overlay

import (
	"fmt"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	user32                         = windows.NewLazySystemDLL("user32.dll")
	procFindWindowW                = user32.NewProc("FindWindowW")
	procGetWindowLongW             = user32.NewProc("GetWindowLongW")
	procSetWindowLongW             = user32.NewProc("SetWindowLongW")
	procSetLayeredWindowAttributes = user32.NewProc("SetLayeredWindowAttributes")
	procSetWindowPos               = user32.NewProc("SetWindowPos")
)

const (
	WS_EX_LAYERED     = 0x80000
	WS_EX_TRANSPARENT = 0x20
	WS_EX_TOPMOST     = 0x8
	WS_EX_NOACTIVATE  = 0x08000000  // Window should not receive focus
	GWL_EXSTYLE       = -20         // int value for GetWindowLong/SetWindowLong
	HWND_TOPMOST      = ^uintptr(0) // -1
	SWP_NOMOVE        = 0x0002
	SWP_NOSIZE        = 0x0001
	SWP_SHOWWINDOW    = 0x0040
	SWP_NOACTIVATE    = 0x0010 // Prevents window activation, allows click-through
	LWA_ALPHA         = 0x2
)

// setupWindowsTransparency sets up window transparency and click-through for Windows.
// It finds the window by title "run-anime" and applies the necessary styles.
func setupWindowsTransparency() error {
	// Convert window title to UTF-16
	title, err := syscall.UTF16PtrFromString("run-anime")
	if err != nil {
		return err
	}

	// Find window by title
	hwnd, _, _ := procFindWindowW.Call(0, uintptr(unsafe.Pointer(title)))
	if hwnd == 0 {
		// Window not found yet, might not be created. Return error to indicate retry needed.
		return fmt.Errorf("window not found")
	}

	// Get current extended window style
	// GWL_EXSTYLE is -20, use int32(-20) directly to avoid constant overflow
	gwlExStyle := int32(-20)
	currentStyle, _, _ := procGetWindowLongW.Call(hwnd, uintptr(gwlExStyle))

	// Add WS_EX_LAYERED, WS_EX_TRANSPARENT, WS_EX_TOPMOST, and WS_EX_NOACTIVATE styles
	// WS_EX_TRANSPARENT enables click-through to windows behind
	// WS_EX_NOACTIVATE prevents the window from receiving focus, allowing animations to continue
	// even when interacting with other applications
	// Note: This makes the entire window click-through, including image areas
	// For selective click-through (only transparent areas), WM_NCHITTEST would be needed
	// but that requires window procedure subclassing which is complex with Ebitengine
	newStyle := currentStyle | uintptr(WS_EX_LAYERED) | uintptr(WS_EX_TRANSPARENT) | uintptr(WS_EX_TOPMOST) | uintptr(WS_EX_NOACTIVATE)

	// Set new extended window style
	// GWL_EXSTYLE is -20, use int32(-20) directly to avoid constant overflow
	_, _, err = procSetWindowLongW.Call(hwnd, uintptr(gwlExStyle), newStyle)
	if err != nil {
		return err
	}

	// Set layered window attributes for transparency (alpha = 255 means fully opaque for visible pixels)
	// LWA_ALPHA flag is used, but we want fully transparent background with opaque content
	// Actually, we want the window to be transparent where there's no content
	// Set alpha to 255 (fully opaque) - the transparency comes from the content itself
	_, _, err = procSetLayeredWindowAttributes.Call(hwnd, 0, 255, LWA_ALPHA)
	if err != nil {
		return err
	}

	// Set window to topmost
	procSetWindowPos.Call(
		hwnd,
		HWND_TOPMOST,
		0, 0, 0, 0,
		SWP_NOMOVE|SWP_NOSIZE|SWP_SHOWWINDOW,
	)

	// Force window update to ensure transparency and click-through take effect
	// SWP_NOACTIVATE ensures clicks pass through to windows behind
	procSetWindowPos.Call(
		hwnd,
		HWND_TOPMOST,
		0, 0, 0, 0,
		SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE|SWP_SHOWWINDOW,
	)

	return nil
}
