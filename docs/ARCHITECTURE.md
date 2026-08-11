# Architecture

## Components

### Mac `quota_bridge.py`

- Polls `STATUS_URL` (default Agent Panel `status.json`) every N seconds.
- Normalizes Claude / Codex / Grok into a flat `QuotaSnapshot` JSON.
- Serves:
  - `GET /health`
  - `POST /pair` `{"code":"1234"}` → `{"token":"..."}` (home LAN: any code ≥4 chars returns the fixed token)
  - `GET /quota` with `Authorization: Bearer <token>`

Dates use Swift `Date` deferred-to-reference-date encoding for the iOS client.

### Mac `voice_bridge.py`

- `POST /v1/transcribe` multipart audio → ffmpeg normalize → whisper-cli
- `POST /v1/send` `{"text":"...","mode":"paste"|"clipboard"}`
- Model auto-pick: `large-v3-turbo` > `medium` > `small` > `base` under `~/.agent-panel/bridge/models` (symlinked from install prefix)

### iPhone app

- Pairs with quota bridge, polls `/quota`, pushes snapshot to Watch via WCSession.
- Receives watch audio (message or file transfer), calls voice bridge, returns transcript.
- On confirm, calls `/v1/send`.

### Watch app + Widget

- Shows providers; tap cycles Claude / Codex / Grok.
- Vertical page: voice capture UI.
- Complication reads compact cache (Keychain access group shared within team wildcard when entitlements allow; open App once after sync to refresh face).

## Trust boundaries

- Watch ↔ iPhone: Apple WCSession (local).
- iPhone ↔ Mac: HTTP + bearer on LAN/VPN only.
- Grok web collector (if used) should stay loopback-only into Agent Panel.
