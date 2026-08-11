#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/Scripts/resolve-xcode.sh"

IPHONE_UDID="${1:-}"
DERIVED_DATA="$ROOT_DIR/.derivedData"
BUILD_SETTINGS=()

if [[ -n "${DEVELOPMENT_TEAM:-}" ]]; then
  BUILD_SETTINGS+=("DEVELOPMENT_TEAM=$DEVELOPMENT_TEAM")
fi

if [[ -z "$IPHONE_UDID" ]]; then
  echo "Usage: Scripts/install-to-watch.sh <paired-iPhone-UDID>"
  echo
  echo "Optional:"
  echo "  DEVELOPMENT_TEAM=<team-id> Scripts/install-to-watch.sh <paired-iPhone-UDID>"
  echo
  echo "Use this to list devices after full Xcode is active:"
  echo "  xcrun xctrace list devices"
  echo
  echo "The Watch app is installed through the iPhone paired with the target Apple Watch."
  exit 2
fi

if ! export_resolved_xcode_developer_dir >/tmp/watch-quota-xcode-path.txt; then
  echo "Full Xcode was not found."
  echo "Install Xcode from the App Store or Apple Developer downloads, then rerun this script."
  exit 1
fi

echo "Using DEVELOPER_DIR=$(cat /tmp/watch-quota-xcode-path.txt)"

if ! xcrun xctrace list devices >/tmp/watch-quota-devices.txt 2>/tmp/watch-quota-devices-error.txt; then
  if grep -qi "not agreed to the Xcode license" /tmp/watch-quota-devices-error.txt 2>/dev/null; then
    echo "Xcode license has not been accepted."
    echo "Open Xcode, or run this in Terminal and follow Apple's license prompt:"
    echo "  sudo xcodebuild -license"
    exit 1
  fi
fi

"$ROOT_DIR/Scripts/create-xcode-project.sh"

xcodebuild \
  -project "$ROOT_DIR/CodexQuotaWatch.xcodeproj" \
  -scheme CodexQuotaWatch \
  -destination "platform=iOS,id=$IPHONE_UDID" \
  -configuration Debug \
  -derivedDataPath "$DERIVED_DATA" \
  -allowProvisioningUpdates \
  ${BUILD_SETTINGS[@]+"${BUILD_SETTINGS[@]}"} \
  build

APP_PATH="$(find "$DERIVED_DATA/Build/Products/Debug-iphoneos" -maxdepth 1 -name 'CodexQuotaWatch.app' -print -quit)"

if [[ -z "$APP_PATH" ]]; then
  echo "Built app was not found under $DERIVED_DATA/Build/Products/Debug-iphoneos"
  exit 1
fi

xcrun devicectl device install app --device "$IPHONE_UDID" "$APP_PATH"

echo "Installed iPhone companion app: $APP_PATH"
echo "If the Watch app does not appear automatically, open the Apple Watch app on iPhone and install Codex Quota from Available Apps."
