package server

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"RunAnime/internal/config"
	"RunAnime/internal/display"
	"RunAnime/internal/settings"
	"RunAnime/internal/storage"
)

const debugLogPath = "/Users/jiseunglyeol/code/run-anime/.cursor/debug.log"

func debugLog(hypothesisId, location, message string, data map[string]interface{}) {
	payload := map[string]interface{}{
		"hypothesisId": hypothesisId,
		"location":     location,
		"message":      message,
		"data":         data,
		"timestamp":    time.Now().UnixMilli(),
	}
	line, _ := json.Marshal(payload)
	f, err := os.OpenFile(debugLogPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return
	}
	f.Write(append(line, '\n'))
	f.Close()
}

type debugResponseWriter struct {
	http.ResponseWriter
	status        int
	contentLength int64
	bytesWritten  int64
}

func (d *debugResponseWriter) WriteHeader(code int) {
	if cl := d.ResponseWriter.Header().Get("Content-Length"); cl != "" {
		fmt.Sscanf(cl, "%d", &d.contentLength)
	}
	d.status = code
	d.ResponseWriter.WriteHeader(code)
}

func (d *debugResponseWriter) Write(p []byte) (n int, err error) {
	n, err = d.ResponseWriter.Write(p)
	d.bytesWritten += int64(n)
	return n, err
}

const maxUploadMem = 10 << 20 // 10 MiB for multipart form

// Run starts the HTTP server (call from main with go server.Run(cfg)).
func Run(cfg *config.Config) {
	port := cfg.Server.Port
	if port == 0 {
		port = 8765
	}
	addr := fmt.Sprintf("localhost:%d", port)

	http.Handle("/", http.FileServer(http.Dir("web")))
	http.HandleFunc("/api/health", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	http.HandleFunc("/api/settings", handleSettings)
	http.HandleFunc("/api/displays/", handleDisplayWallpaper)
	http.HandleFunc("/api/upload", handleUpload)
	http.HandleFunc("/api/uploads/", handleUploads)

	log.Printf("web server listening on http://%s", addr)
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Printf("server: %v", err)
	}
}

func handleSettings(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		getSettings(w)
		return
	case http.MethodPost:
		postSettings(w, r)
		return
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

type getSettingsResponse struct {
	Monitors []settings.Monitor `json:"monitors"`
	Animes   []settings.Anime   `json:"animes"`
	Language string             `json:"language"`
	DarkMode bool               `json:"darkMode"`
	Displays []display.Display  `json:"displays,omitempty"`
}

func getSettings(w http.ResponseWriter) {
	s, err := settings.Load()
	if err != nil {
		log.Printf("settings load: %v", err)
		http.Error(w, "failed to load settings", http.StatusInternalServerError)
		return
	}
	out := resolveUploadURLs(s)
	displays, _ := display.List()
	resp := getSettingsResponse{
		Monitors: out.Monitors,
		Animes:   out.Animes,
		Language: out.Language,
		DarkMode: out.DarkMode,
		Displays: displays,
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Printf("settings encode: %v", err)
	}
}

func resolveUploadURLs(s *settings.Settings) *settings.Settings {
	c := *s
	c.Monitors = make([]settings.Monitor, len(s.Monitors))
	for i, m := range s.Monitors {
		c.Monitors[i] = m
		if m.BackgroundImage != "" && !strings.HasPrefix(m.BackgroundImage, "data:") && !strings.HasPrefix(m.BackgroundImage, "/") {
			c.Monitors[i].BackgroundImage = "/api/uploads/" + m.BackgroundImage
		}
	}
	c.Animes = make([]settings.Anime, len(s.Animes))
	for i, a := range s.Animes {
		c.Animes[i] = a
		c.Animes[i].States = make([]settings.State, len(a.States))
		for j, st := range a.States {
			c.Animes[i].States[j] = st
			if st.SpritePath != "" && !strings.HasPrefix(st.SpritePath, "data:") && !strings.HasPrefix(st.SpritePath, "/") {
				c.Animes[i].States[j].SpritePath = "/api/uploads/" + st.SpritePath
			}
		}
	}
	return &c
}

func postSettings(w http.ResponseWriter, r *http.Request) {
	var body settings.Settings
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	cur, _ := settings.Load()
	if cur != nil && body.Language == "" {
		body.Language = cur.Language
	}
	curByID := make(map[string]settings.Monitor)
	if cur != nil {
		for _, m := range cur.Monitors {
			curByID[m.ID] = m
		}
	}
	relPath := func(s string) string {
		if s == "" || strings.HasPrefix(s, "data:") {
			return ""
		}
		if strings.HasPrefix(s, "/api/uploads/") {
			return strings.TrimPrefix(s, "/api/uploads/")
		}
		return s
	}
	for i := range body.Monitors {
		old := curByID[body.Monitors[i].ID].BackgroundImage
		newRel := relPath(body.Monitors[i].BackgroundImage)
		if old != "" && old != newRel {
			if err := storage.RemoveUpload(old); err != nil {
				log.Printf("remove old background: %v", err)
			}
		}
	}
	curAnimeByID := make(map[string]*settings.Anime)
	if cur != nil {
		for i := range cur.Animes {
			a := &cur.Animes[i]
			curAnimeByID[a.ID] = a
		}
	}
	for i := range body.Animes {
		curAnime := curAnimeByID[body.Animes[i].ID]
		for j := range body.Animes[i].States {
			old := ""
			if curAnime != nil {
				for k := range curAnime.States {
					if curAnime.States[k].ID == body.Animes[i].States[j].ID {
						old = curAnime.States[k].SpritePath
						break
					}
				}
			}
			newRel := relPath(body.Animes[i].States[j].SpritePath)
			if old != "" && old != newRel {
				if err := storage.RemoveUpload(old); err != nil {
					log.Printf("remove old sprite: %v", err)
				}
			}
		}
	}
	// Save base64 images to storage and replace with relative paths (category/filename)
	for i := range body.Monitors {
		if strings.HasPrefix(body.Monitors[i].BackgroundImage, "data:") {
			rel, err := storage.SaveBase64Image(body.Monitors[i].BackgroundImage, storage.CategoryBackgrounds)
			if err != nil {
				log.Printf("save monitor bg: %v", err)
				continue
			}
			body.Monitors[i].BackgroundImage = rel
		}
	}
	for i := range body.Animes {
		for j := range body.Animes[i].States {
			if strings.HasPrefix(body.Animes[i].States[j].SpritePath, "data:") {
				rel, err := storage.SaveBase64Image(body.Animes[i].States[j].SpritePath, storage.CategorySprites)
				if err != nil {
					log.Printf("save sprite: %v", err)
					continue
				}
				body.Animes[i].States[j].SpritePath = rel
			}
		}
	}
	if err := settings.Save(&body); err != nil {
		log.Printf("settings save: %v", err)
		http.Error(w, "failed to save settings", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resolveUploadURLs(&body)); err != nil {
		log.Printf("settings encode: %v", err)
	}
}

func handleUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := r.ParseMultipartForm(maxUploadMem); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "file required", http.StatusBadRequest)
		return
	}
	defer file.Close()
	categoryForm := strings.TrimSpace(strings.ToLower(r.FormValue("category")))
	var storageCategory string
	switch categoryForm {
	case "sprite":
		storageCategory = storage.CategorySprites
	case "background":
		storageCategory = storage.CategoryBackgrounds
	default:
		http.Error(w, "category must be sprite or background", http.StatusBadRequest)
		return
	}
	ct := header.Header.Get("Content-Type")
	ct = strings.TrimSpace(strings.ToLower(ct))
	allowed := map[string]bool{
		"image/png": true, "image/jpeg": true, "image/jpg": true,
		"image/gif": true, "image/webp": true,
	}
	if !allowed[ct] {
		http.Error(w, "unsupported image type", http.StatusBadRequest)
		return
	}
	rel, err := storage.SaveUploadedFile(file, ct, storageCategory)
	if err != nil {
		log.Printf("upload save: %v", err)
		http.Error(w, "failed to save file", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"path": rel})
}

func handleDisplayWallpaper(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// Path: /api/displays/0/wallpaper -> suffix "0/wallpaper"
	suffix := strings.TrimPrefix(r.URL.Path, "/api/displays/")
	suffix = strings.TrimPrefix(suffix, "/")
	parts := strings.SplitN(suffix, "/", 2)
	if len(parts) < 2 || parts[1] != "wallpaper" {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	index, err := strconv.Atoi(parts[0])
	if err != nil || index < 0 {
		http.Error(w, "invalid display index", http.StatusBadRequest)
		return
	}
	wallPath, err := display.WallpaperPath(index)
	if err != nil {
		if err == display.ErrUnsupported {
			http.Error(w, "wallpaper not supported on this platform", http.StatusNotImplemented)
			return
		}
		log.Printf("wallpaper path: %v", err)
		http.Error(w, "failed to get wallpaper path", http.StatusInternalServerError)
		return
	}
	if wallPath == "" {
		http.Error(w, "no wallpaper set", http.StatusNotFound)
		return
	}
	jpegPath, cleanup, err := display.ConvertToJPEGIfHEIC(wallPath)
	if err != nil {
		log.Printf("wallpaper heic convert: %v", err)
		http.Error(w, "failed to convert wallpaper", http.StatusInternalServerError)
		return
	}
	if cleanup != nil {
		defer cleanup()
	}
	imgBytes, mime, err := storage.ReadAndCompressToMaxBytes(jpegPath, 10*1024*1024)
	if err != nil {
		log.Printf("wallpaper read: %v", err)
		http.Error(w, "failed to get wallpaper", http.StatusInternalServerError)
		return
	}
	dataURL := "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(imgBytes)
	displays, _ := display.List()
	width, height := 1920, 1080
	for _, d := range displays {
		if d.Index == index {
			width, height = d.Width, d.Height
			break
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   dataURL,
		"width":  width,
		"height": height,
	})
}

func handleUploads(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	name := strings.TrimPrefix(r.URL.Path, "/api/uploads/")
	name = filepath.ToSlash(name)
	if name == "" || strings.Contains(name, "..") {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	dir, err := storage.Dir()
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	path := filepath.Join(dir, filepath.FromSlash(name))
	// #region agent log
	debugLog("H1", "server.go:handleUploads", "resolved path", map[string]interface{}{
		"urlPath": r.URL.Path, "name": name, "dir": dir, "path": path,
	})
	// #endregion
	// Ensure path is under dir (no symlink escape)
	absDir, _ := filepath.Abs(dir)
	absPath, _ := filepath.Abs(path)
	if !strings.HasPrefix(absPath, absDir+string(filepath.Separator)) && absPath != absDir {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	// #region agent log
	stat, statErr := os.Stat(path)
	exists := statErr == nil
	isDir := exists && stat.IsDir()
	size := int64(0)
	if exists && stat != nil {
		size = stat.Size()
	}
	debugLog("H2", "server.go:handleUploads", "file stat before ServeFile", map[string]interface{}{
		"absPath": absPath, "exists": exists, "isDir": isDir, "size": size, "statErr": fmt.Sprint(statErr),
	})
	// #endregion
	// Ignore Range so we always return 200 with full body; 206 + partial bytes breaks image display.
	r.Header.Del("Range")
	// #region agent log
	debugLog("H3", "server.go:handleUploads", "calling ServeFile", map[string]interface{}{
		"path": path, "fileSize": size,
	})
	rw := &debugResponseWriter{ResponseWriter: w, status: 0, contentLength: -1, bytesWritten: 0}
	// #endregion
	http.ServeFile(rw, r, path)
	// #region agent log
	debugLog("H4", "server.go:handleUploads", "after ServeFile", map[string]interface{}{
		"status": rw.status, "contentLengthHeader": rw.contentLength, "bytesWritten": rw.bytesWritten,
	})
	// #endregion
}
