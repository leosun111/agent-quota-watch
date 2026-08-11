#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"
PREFIX="${AGENT_QUOTA_HOME:-$HOME/.agent-quota-watch}"
HOST="${AGENT_QUOTA_HOST:-0.0.0.0}"
QUOTA_PORT="${AGENT_QUOTA_PORT:-8791}"
VOICE_PORT="${AGENT_VOICE_PORT:-8792}"
STATUS_URL="${AGENT_PANEL_STATUS_URL:-http://127.0.0.1:8790/status.json}"

mkdir -p "$PREFIX"/{bin,secrets,state,logs,models,launchd}

# Token
TOKEN_FILE="$PREFIX/secrets/watch-quota-token"
if [[ ! -f "$TOKEN_FILE" ]]; then
  openssl rand -hex 24 > "$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE"
  echo "Generated token: $TOKEN_FILE"
else
  echo "Using existing token: $TOKEN_FILE"
fi

cp "$ROOT/quota_bridge.py" "$PREFIX/bin/quota_bridge.py"
cp "$ROOT/voice_bridge.py" "$PREFIX/bin/voice_bridge.py"
chmod +x "$PREFIX/bin/"*.py

# Optional whisper model hint
if [[ ! -f "$PREFIX/models/ggml-small.bin" ]]; then
  cat <<HINT
Whisper model not found.
Download (recommended small for Chinese):
  mkdir -p "$PREFIX/models"
  curl -L -o "$PREFIX/models/ggml-small.bin" \\
    https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin

Larger (better accuracy):
  curl -L -o "$PREFIX/models/ggml-large-v3-turbo.bin" \\
    https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin

Also install: brew install ffmpeg whisper-cpp
HINT
fi

# Symlink models path expected by voice_bridge
mkdir -p "$HOME/.agent-panel/bridge"
ln -sfn "$PREFIX/models" "$HOME/.agent-panel/bridge/models"
ln -sfn "$PREFIX/bin/voice_bridge.py" "$HOME/.agent-panel/bridge/voice_bridge.py" 2>/dev/null || true

UID_NUM="$(id -u)"
for svc in quota-bridge voice-bridge; do
  if [[ "$svc" == "quota-bridge" ]]; then
    PROG=(/usr/bin/python3 "$PREFIX/bin/quota_bridge.py"
      --host "$HOST" --port "$QUOTA_PORT"
      --status-url "$STATUS_URL"
      --token-file "$TOKEN_FILE"
      --poll-seconds 15)
    LABEL="com.agentquotawatch.quota-bridge"
  else
    PROG=(/usr/bin/python3 "$PREFIX/bin/voice_bridge.py"
      --host "$HOST" --port "$VOICE_PORT"
      --token-file "$TOKEN_FILE")
    LABEL="com.agentquotawatch.voice-bridge"
  fi

  PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
  {
    echo '<?xml version="1.0" encoding="UTF-8"?>'
    echo '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
    echo '<plist version="1.0"><dict>'
    echo "  <key>Label</key><string>${LABEL}</string>"
    echo '  <key>ProgramArguments</key><array>'
    for a in "${PROG[@]}"; do echo "    <string>${a}</string>"; done
    echo '  </array>'
    echo '  <key>RunAtLoad</key><true/>'
    echo '  <key>KeepAlive</key><true/>'
    echo "  <key>StandardOutPath</key><string>${PREFIX}/logs/${svc}.out.log</string>"
    echo "  <key>StandardErrorPath</key><string>${PREFIX}/logs/${svc}.err.log</string>"
    echo '  <key>EnvironmentVariables</key><dict>'
    echo '    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>'
    echo "    <key>HOME</key><string>${HOME}</string>"
    echo '  </dict>'
    echo '</dict></plist>'
  } > "$PLIST"

  launchctl bootout "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
  launchctl bootstrap "gui/${UID_NUM}" "$PLIST"
  echo "Started $LABEL"
done

IP="$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo '<your-lan-ip>')"
echo
echo "OK."
echo "  Quota:  http://${IP}:${QUOTA_PORT}/health"
echo "  Voice:  http://${IP}:${VOICE_PORT}/health"
echo "  Token:  $TOKEN_FILE"
echo
echo "Pair from iPhone Agent Quota app:"
echo "  URL  = http://${IP}:${QUOTA_PORT}"
echo "  Code = any 4+ digits"
echo "  Voice uses same host port ${VOICE_PORT} automatically."
