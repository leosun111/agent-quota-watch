#!/usr/bin/env bash
set -euo pipefail
UID_NUM="$(id -u)"
for LABEL in com.agentquotawatch.quota-bridge com.agentquotawatch.voice-bridge; do
  launchctl bootout "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/${LABEL}.plist"
  echo "Removed $LABEL"
done
