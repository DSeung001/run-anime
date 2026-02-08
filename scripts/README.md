# Scripts

## 개발 (빌드 + 실행 한 번에)

- **dev.sh** – macOS/Linux: `./scripts/dev.sh` or `bash scripts/dev.sh`
- **dev.ps1** – Windows: `.\scripts\dev.ps1` (PowerShell)

동작: frontend `npm install` → `npm run build` → 프로젝트 루트에서 `go run ./cmd/runanime`. 웹 UI와 서버·오버레이가 한 번에 실행됩니다.

## 배포용 빌드 (exe만 생성)

- **build.sh** – macOS/Linux: `./scripts/build.sh` or `bash scripts/build.sh`
- **build.ps1** – Windows: `.\scripts\build.ps1` (PowerShell)

Output: `runanime` (Unix) or `runanime.exe` (Windows) in the project root. 실행 시 프로젝트 루트에 `web/` 폴더가 있어야 웹 UI가 동작합니다.
