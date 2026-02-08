#!/usr/bin/env bash
# Build run-anime for macOS (and current OS).
set -e
cd "$(dirname "$0")/.."
go build -o runanime ./cmd/runanime
echo "Built: ./runanime"
