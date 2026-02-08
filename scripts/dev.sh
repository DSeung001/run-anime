#!/usr/bin/env bash
# Build frontend and run the app (server + overlay). Run from project root or anywhere.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/frontend"
echo "==> Installing frontend dependencies..."
npm install
echo "==> Building frontend..."
npm run build
cd "$ROOT"
echo "==> Starting run-anime..."
go run ./cmd/runanime
