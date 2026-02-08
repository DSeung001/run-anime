package main

import (
	"log"
	"os"

	"RunAnime/internal/config"
	"RunAnime/internal/overlay"
	"RunAnime/internal/server"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config load: %v", err)
	}

	if os.Getenv("RUNANIME_NO_SERVER") != "1" {
		go server.Run(cfg)
	}

	if err := overlay.Run(cfg); err != nil {
		log.Fatal(err)
	}
}
