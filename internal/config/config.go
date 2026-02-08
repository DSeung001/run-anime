package config

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

func init() {
	// macOS Metal nextDrawable 실패 우회: Ebiten 로드 전에 OpenGL 지정 (config는 overlay/ebiten보다 먼저 init됨)
	if os.Getenv("EBITENGINE_GRAPHICS_LIBRARY") == "" {
		os.Setenv("EBITENGINE_GRAPHICS_LIBRARY", "opengl")
	}
}

// Config is the application configuration.
type Config struct {
	Server  ServerConfig  `yaml:"server"`
	Sprites []SpriteEntry `yaml:"sprites"`
	Overlay OverlayConfig `yaml:"overlay"`
}

// ServerConfig holds web server settings.
type ServerConfig struct {
	Port int `yaml:"port"`
}

// SpriteEntry describes one sprite (sheet path, row/col, position, priority).
type SpriteEntry struct {
	Path     string `yaml:"path"`
	Rows     int    `yaml:"rows"`
	Cols     int    `yaml:"cols"`
	X        int    `yaml:"x"`
	Y        int    `yaml:"y"`
	Priority int    `yaml:"priority"`
}

// OverlayConfig holds overlay window settings.
type OverlayConfig struct {
	Width  int `yaml:"width"`
	Height int `yaml:"height"`
}

// Dir returns the OS-specific config directory (e.g. ~/Library/Application Support/runanime).
func Dir() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("user config dir: %w", err)
	}
	return filepath.Join(dir, "runanime"), nil
}

// Path returns the full path to config.yaml.
func Path() (string, error) {
	d, err := Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(d, "config.yaml"), nil
}

// Load reads config from the OS config dir, or returns default if missing.
func Load() (*Config, error) {
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
	var c Config
	if err := yaml.Unmarshal(data, &c); err != nil {
		return nil, err
	}
	if c.Server.Port == 0 {
		c.Server.Port = 8765
	}
	if c.Overlay.Width == 0 {
		c.Overlay.Width = 128
	}
	if c.Overlay.Height == 0 {
		c.Overlay.Height = 128
	}
	return &c, nil
}

// Save writes config to the OS config dir.
func Save(c *Config) error {
	d, err := Dir()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(d, 0755); err != nil {
		return err
	}
	p, _ := Path()
	data, err := yaml.Marshal(c)
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0644)
}

// Default returns default configuration.
func Default() *Config {
	return &Config{
		Server:  ServerConfig{Port: 8765},
		Overlay: OverlayConfig{Width: 128, Height: 128},
		Sprites: nil,
	}
}
