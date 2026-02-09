package settings

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"RunAnime/internal/config"
)

// Monitor represents a display (monitor) with resolution and optional background.
type Monitor struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Width           int    `json:"width"`
	Height          int    `json:"height"`
	BackgroundImage string `json:"backgroundImage"` // URL path or empty; not base64 in stored JSON
}

// State represents an emotion state with image and chat messages.
type State struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	SpritePath  string   `json:"spritePath"` // URL path or empty (kept for compatibility)
	Chats       []string `json:"chats"`
	X           int      `json:"x,omitempty"`           // Position X in per-mille (0-1000), 0 means use Anime's X
	Y           int      `json:"y,omitempty"`           // Position Y in per-mille (0-1000), 0 means use Anime's Y
	Width       int      `json:"width,omitempty"`       // Width in per-mille (0-1000), 0 means use Anime's Width
	Height      int      `json:"height,omitempty"`      // Height in per-mille (0-1000), 0 means use Anime's Height
	GIFDisposal []byte   `json:"gifDisposal,omitempty"` // GIF disposal methods for each frame (extracted on upload)
}

// Anime represents a character with position and states.
type Anime struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	MonitorID string  `json:"monitorId"`
	Width     int     `json:"width"`
	Height    int     `json:"height"`
	X         int     `json:"x"`
	Y         int     `json:"y"`
	States    []State `json:"states"`
}

// Settings is the web UI settings payload (monitors + animes + UI preferences).
type Settings struct {
	Monitors []Monitor `json:"monitors"`
	Animes   []Anime   `json:"animes"`
	Language string    `json:"language"` // "ko" or "en"
	DarkMode bool      `json:"darkMode"` // true = black theme, false = white theme
}

// Path returns the full path to settings.json.
func Path() (string, error) {
	d, err := config.Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(d, "settings.json"), nil
}

// Load reads settings from the config directory. Returns default if file does not exist.
func Load() (*Settings, error) {
	p, err := Path()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return Default(), nil
		}
		return nil, err
	}
	var s Settings
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, fmt.Errorf("settings decode: %w", err)
	}
	if len(s.Monitors) == 0 {
		s.Monitors = Default().Monitors
	}
	if len(s.Animes) == 0 {
		s.Animes = Default().Animes
	}
	// Apply defaults for UI preferences when missing (e.g. old settings file)
	if s.Language == "" {
		s.Language = "ko"
		s.DarkMode = true
	}
	return &s, nil
}

// Save writes settings to the config directory.
func Save(s *Settings) error {
	d, err := config.Dir()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(d, 0755); err != nil {
		return err
	}
	p, _ := Path()
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0644)
}

// Default returns default settings (one monitor, one anime with default states).
func Default() *Settings {
	return &Settings{
		Language: "ko",
		DarkMode: true,
		Monitors: []Monitor{
			{ID: "mon-1", Name: "Display 1", Width: 1920, Height: 1080, BackgroundImage: ""},
		},
		Animes: []Anime{
			{
				ID:        "1",
				Name:      "기본 캐릭터",
				MonitorID: "mon-1",
				Width:     120,
				Height:    120,
				X:         100,
				Y:         100,
				States: []State{
					{ID: "s1", Name: "기본", Chats: []string{"안녕!", "반가워."}},
					{ID: "s2", Name: "기쁨", Chats: []string{"히히!", "오늘 기분 좋아!"}},
					{ID: "s3", Name: "슬픔", Chats: []string{}},
					{ID: "s4", Name: "분노", Chats: []string{}},
				},
			},
		},
	}
}
