#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "xcodegen is required to generate CodexQuotaWatch.xcodeproj."
  echo "Install it with: brew install xcodegen"
  exit 1
fi

xcodegen generate --spec project.yml

echo "Generated: $ROOT_DIR/CodexQuotaWatch.xcodeproj"
