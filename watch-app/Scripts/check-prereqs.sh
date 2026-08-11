#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/Scripts/resolve-xcode.sh"
source "$ROOT_DIR/Scripts/watch-install-guard.sh"

IPHONE_UDID=""
REQUIRE_PHYSICAL_DEVICES=0

if [[ "${1:-}" == "--device" ]]; then
  IPHONE_UDID="${2:-}"
  REQUIRE_PHYSICAL_DEVICES=1
  if [[ -z "$IPHONE_UDID" ]]; then
    echo "Usage: Scripts/check-prereqs.sh [--device <paired-iPhone-UDID>]"
    exit 2
  fi
elif [[ $# -ne 0 ]]; then
  echo "Usage: Scripts/check-prereqs.sh [--device <paired-iPhone-UDID>]"
  exit 2
fi

echo "Checking Apple Watch MVP prerequisites in: $ROOT_DIR"

missing=0

if ! export_resolved_xcode_developer_dir >/tmp/watch-quota-xcode-path.txt; then
  echo "missing: full Xcode was not found."
  echo "checked: DEVELOPER_DIR, /Applications/Xcode.app, ~/Applications/Xcode*.app"
  echo "fix: install Xcode from the App Store or Apple Developer downloads."
  echo "optional global select after install:"
  echo "  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
  missing=1
elif ! xcodebuild -version >/tmp/watch-quota-xcodebuild-version.txt 2>/tmp/watch-quota-xcodebuild-error.txt; then
  echo "missing: Xcode exists but xcodebuild failed."
  echo "using: $(cat /tmp/watch-quota-xcode-path.txt)"
  cat /tmp/watch-quota-xcodebuild-error.txt
  missing=1
else
  echo "ok: $(head -n 1 /tmp/watch-quota-xcodebuild-version.txt)"
  echo "ok: DEVELOPER_DIR=$(cat /tmp/watch-quota-xcode-path.txt)"
fi

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "missing: xcodegen is not installed."
  echo "fix: brew install xcodegen"
  missing=1
else
  echo "ok: xcodegen $(xcodegen --version)"
fi

PBXPROJ="$ROOT_DIR/CodexQuotaWatch.xcodeproj/project.pbxproj"
IPHONE_INFO_PLIST="$ROOT_DIR/iPhone/Info.plist"
if [[ -f "$PBXPROJ" && -f "$IPHONE_INFO_PLIST" ]]; then
  project_text="$(<"$PBXPROJ")$(<"$IPHONE_INFO_PLIST")"
  if watch_project_text_is_installable "$project_text"; then
    echo "ok: canonical project has Watch companion, icon, and local-network settings"
  else
    echo "missing: CodexQuotaWatch.xcodeproj is stale or lacks install-critical settings."
    echo "fix: Scripts/create-xcode-project.sh"
    missing=1
  fi
else
  echo "missing: canonical CodexQuotaWatch.xcodeproj or iPhone/Info.plist was not found."
  echo "fix: Scripts/create-xcode-project.sh"
  missing=1
fi

STALE_PROJECT="$ROOT_DIR/CodexQuotaWatch 2.xcodeproj"
if [[ -d "$STALE_PROJECT" ]]; then
  echo "warn: found stale duplicate project: $STALE_PROJECT"
  echo "use only: $ROOT_DIR/CodexQuotaWatch.xcodeproj"
fi

device_list_available=0
if command -v xcrun >/dev/null 2>&1 && xcrun xctrace list devices >/tmp/watch-quota-devices.txt 2>/tmp/watch-quota-devices-error.txt; then
  device_list_available=1
  device_list="$(</tmp/watch-quota-devices.txt)"
  echo "physical iPhone / Apple Watch devices:"
  physical_devices="${device_list%%== Simulators ==*}"
  grep -E "iPhone|Apple Watch|Watch Ultra|Watch Series|Watch SE" <<<"$physical_devices" || echo "  none detected by xctrace"

  if [[ $REQUIRE_PHYSICAL_DEVICES -eq 1 ]]; then
    if watch_device_is_available "$IPHONE_UDID" "$device_list"; then
      echo "ok: target iPhone is connected: $IPHONE_UDID"
    else
      echo "missing: target iPhone is offline or not detected: $IPHONE_UDID"
      echo "fix: unlock it, connect it by cable, trust this Mac, and rerun."
      missing=1
    fi

    if watch_device_list_has_physical_watch "$device_list"; then
      echo "ok: a physical Apple Watch is visible to Xcode"
    else
      echo "missing: Xcode does not see a physical Apple Watch."
      echo "fix: pair it in Xcode Device Hub and enable Developer Mode on the Watch."
      missing=1
    fi
  elif ! watch_device_list_has_physical_watch "$device_list"; then
    echo "warn: no physical Apple Watch is visible; simulator work is available, device install is not."
  fi
else
  if grep -qi "not agreed to the Xcode license" /tmp/watch-quota-devices-error.txt 2>/dev/null; then
    echo "missing: Xcode license has not been accepted."
    echo "fix: open Xcode, or run this in Terminal and follow Apple's license prompt:"
    echo "  sudo xcodebuild -license"
    missing=1
  else
    echo "warn: cannot list iPhone / Apple Watch devices yet."
    sed -n '1,4p' /tmp/watch-quota-devices-error.txt 2>/dev/null || true
    if [[ $REQUIRE_PHYSICAL_DEVICES -eq 1 ]]; then
      missing=1
    fi
  fi
fi

if security find-identity -v -p codesigning 2>/dev/null | grep -q '"Apple Development:'; then
  echo "ok: Apple Development signing identity is available"
elif [[ $REQUIRE_PHYSICAL_DEVICES -eq 1 ]]; then
  echo "missing: no Apple Development signing identity is available."
  echo "fix: add the Apple ID in Xcode Settings > Accounts and select the same Team for both targets."
  missing=1
else
  echo "warn: no Apple Development signing identity; simulator builds remain available."
fi

if [[ $missing -ne 0 ]]; then
  exit 1
fi

if [[ $REQUIRE_PHYSICAL_DEVICES -eq 1 && $device_list_available -eq 1 ]]; then
  echo "All physical-device install prerequisites are present."
else
  echo "All project and command-line prerequisites are present."
fi
