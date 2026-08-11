#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export COPYFILE_DISABLE=1
xattr -cr .
xcodegen generate
rm -rf .derivedData/Build/Products
xcodebuild -project CodexQuotaWatch.xcodeproj -scheme CodexQuotaWatch \
  -destination "platform=iOS,id=${1:-00008140-001E4D2C3EF3001C}" \
  -configuration Debug -derivedDataPath .derivedData \
  -allowProvisioningUpdates DEVELOPMENT_TEAM=YOUR_TEAM_ID COPYFILE_DISABLE=1 build || true
APP=".derivedData/Build/Products/Debug-iphoneos/CodexQuotaWatch.app"
WATCH="$APP/Watch/CodexQuotaWatchWatch.app"
find .derivedData/Build/Products -print0 | xargs -0 xattr -c 2>/dev/null || true
IDENTITY="Apple Development: leo.sunj@me.com (UPGL9M3V9H)"
ENT_W=".derivedData/Build/Intermediates.noindex/CodexQuotaWatch.build/Debug-watchos/CodexQuotaWatchWatch.build/CodexQuotaWatchWatch.app.xcent"
ENT_I=".derivedData/Build/Intermediates.noindex/CodexQuotaWatch.build/Debug-iphoneos/CodexQuotaWatch.build/CodexQuotaWatch.app.xcent"
codesign --force --sign "$IDENTITY" --entitlements "$ENT_W" --timestamp=none --generate-entitlement-der "$WATCH"
codesign --force --sign "$IDENTITY" --timestamp=none --generate-entitlement-der "$APP/CodexQuotaWatch.debug.dylib" || true
codesign --force --sign "$IDENTITY" --entitlements "$ENT_I" --timestamp=none --generate-entitlement-der "$APP"
xcrun devicectl device install app --device "${2:-9F403620-FCCC-500F-944A-FBD60D5674D0}" "$APP"
echo "Installed. Open Agent Quota on iPhone + Watch."
