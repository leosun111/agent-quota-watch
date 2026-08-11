#!/usr/bin/env python3
"""LAN quota bridge for Apple Watch / iPhone.

Reads Agent Panel status.json (Claude + Codex + Grok via Chrome extension)
and exposes the WatchQuotaApp-compatible API:

  POST /pair   {"code":"..."} -> {"token":"..."}
  GET  /quota  Authorization: Bearer <token>
  GET  /health

Binds to LAN so Watch/iPhone can poll; Agent Panel stays on 127.0.0.1.
"""

from __future__ import annotations

import argparse
import hmac
import json
import logging
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Optional
from urllib.request import urlopen

LOG = logging.getLogger("quota-bridge")

# Swift JSONEncoder .deferredToDate = seconds since 2001-01-01 UTC
SWIFT_REFERENCE = datetime(2001, 1, 1, tzinfo=timezone.utc).timestamp()


def swift_date(ts: float | int | None) -> Optional[float]:
    if ts is None:
        return None
    # Agent panel uses ms epoch for grok; agents use resetIn seconds remaining
    value = float(ts)
    if value > 1e12:  # ms
        value = value / 1000.0
    return value - SWIFT_REFERENCE


def now_swift() -> float:
    return time.time() - SWIFT_REFERENCE


def load_token(path: Path) -> str:
    return path.expanduser().read_text(encoding="utf-8").strip()


def fetch_status(url: str, timeout: float = 8.0) -> dict[str, Any]:
    with urlopen(url, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def agent_to_provider(agent: dict[str, Any], captured_at: float) -> dict[str, Any]:
    aid = str(agent.get("id") or "unknown")
    label = str(agent.get("label") or aid).title()
    windows: list[dict[str, Any]] = []

    r5 = agent.get("remain5h")
    if isinstance(r5, (int, float)):
        left = float(r5)
        used = max(0.0, min(100.0, 100.0 - left))
        resets_at = None
        reset_in = agent.get("resetIn")
        if isinstance(reset_in, (int, float)) and aid == "claude":
            # Claude 5h window: resetIn is seconds until 5h reset
            resets_at = now_swift() + float(reset_in)
        windows.append(
            {
                "id": "five_hour",
                "label": "5小时",
                "usedPercentage": used,
                "leftPercentage": left,
                "resetsAt": resets_at,
            }
        )

    r7 = agent.get("remain7d")
    if isinstance(r7, (int, float)):
        left = float(r7)
        used = max(0.0, min(100.0, 100.0 - left))
        resets_at = None
        reset_in = agent.get("resetIn")
        # For codex, resetIn is weekly; for claude weekly we lack separate field
        if isinstance(reset_in, (int, float)) and aid == "codex":
            resets_at = now_swift() + float(reset_in)
        windows.append(
            {
                "id": "seven_day",
                "label": "7天",
                "usedPercentage": used,
                "leftPercentage": left,
                "resetsAt": resets_at,
            }
        )

    return {
        "id": aid,
        "displayName": label if label != aid.title() else {
            "claude": "Claude",
            "codex": "Codex",
        }.get(aid, label),
        "sourceDescription": "Agent Panel",
        "updatedAt": captured_at,
        "windows": windows,
    }


def grok_to_provider(grok: dict[str, Any], captured_at: float) -> Optional[dict[str, Any]]:
    if not isinstance(grok, dict):
        return None
    status = grok.get("status")
    if status != "ok":
        return {
            "id": "grok",
            "displayName": "Grok",
            "sourceDescription": f"Chrome extension ({grok.get('error') or status or 'error'})",
            "updatedAt": swift_date(grok.get("observedAt")) or captured_at,
            "windows": [],
        }

    remain = grok.get("remain7d")
    used = grok.get("used7d")
    if not isinstance(remain, (int, float)):
        return None
    if not isinstance(used, (int, float)):
        used = 100.0 - float(remain)

    return {
        "id": "grok",
        "displayName": "Grok",
        "sourceDescription": "Chrome extension → Agent Panel",
        "updatedAt": swift_date(grok.get("observedAt")) or captured_at,
        "windows": [
            {
                "id": "seven_day",
                "label": "周额度",
                "usedPercentage": float(used),
                "leftPercentage": float(remain),
                "resetsAt": swift_date(grok.get("resetAt")),
            }
        ],
    }


def build_snapshot(status: dict[str, Any]) -> dict[str, Any]:
    captured = now_swift()
    ts = status.get("ts")
    if isinstance(ts, (int, float)):
        captured = swift_date(ts) or captured

    providers: list[dict[str, Any]] = []
    order = {"claude": 0, "codex": 1, "grok": 2}

    for agent in status.get("agents") or []:
        if isinstance(agent, dict):
            providers.append(agent_to_provider(agent, captured))

    grok_p = grok_to_provider(status.get("grok") or {}, captured)
    if grok_p:
        providers.append(grok_p)

    providers.sort(key=lambda p: order.get(p["id"], 99))

    return {
        "capturedAt": captured,
        "activeSessionCount": 0,
        "providers": providers,
    }


class SnapshotCache:
    def __init__(self, status_url: str, poll_seconds: float) -> None:
        self.status_url = status_url
        self.poll_seconds = poll_seconds
        self._lock = threading.Lock()
        self._snapshot: Optional[dict[str, Any]] = None
        self._error: Optional[str] = None
        self._updated_at = 0.0

    def start(self) -> None:
        t = threading.Thread(target=self._loop, name="status-poll", daemon=True)
        t.start()

    def _loop(self) -> None:
        while True:
            try:
                status = fetch_status(self.status_url)
                snap = build_snapshot(status)
                with self._lock:
                    self._snapshot = snap
                    self._error = None
                    self._updated_at = time.time()
                LOG.info(
                    "snapshot ok providers=%s",
                    [p["id"] for p in snap["providers"]],
                )
            except Exception as exc:  # noqa: BLE001
                with self._lock:
                    self._error = str(exc)
                LOG.warning("status fetch failed: %s", exc)
            time.sleep(self.poll_seconds)

    def get(self) -> tuple[Optional[dict[str, Any]], Optional[str]]:
        with self._lock:
            return self._snapshot, self._error


def make_handler(cache: SnapshotCache, token: str):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt: str, *args: Any) -> None:
            LOG.info("%s - %s", self.address_string(), fmt % args)

        def _send(self, code: int, body: bytes, content_type: str = "application/json") -> None:
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def _json(self, code: int, obj: Any) -> None:
            self._send(code, json.dumps(obj, separators=(",", ":")).encode("utf-8"))

        def _auth_ok(self) -> bool:
            auth = self.headers.get("Authorization", "")
            if not auth.startswith("Bearer "):
                return False
            got = auth[7:].strip()
            return bool(got) and hmac.compare_digest(got, token)

        def do_GET(self) -> None:  # noqa: N802
            path = self.path.split("?", 1)[0]
            if path == "/health":
                snap, err = cache.get()
                self._json(
                    200,
                    {
                        "status": "ok" if snap else "degraded",
                        "error": err,
                        "providers": [p["id"] for p in (snap or {}).get("providers", [])],
                    },
                )
                return
            if path == "/quota":
                if not self._auth_ok():
                    self._json(401, {"error": "unauthorized"})
                    return
                snap, err = cache.get()
                if snap is None:
                    self._json(503, {"error": err or "no snapshot yet"})
                    return
                self._json(200, snap)
                return
            self._json(404, {"error": "not found"})

        def do_POST(self) -> None:  # noqa: N802
            path = self.path.split("?", 1)[0]
            if path != "/pair":
                self._json(404, {"error": "not found"})
                return
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length else b"{}"
            try:
                payload = json.loads(raw.decode("utf-8") or "{}")
            except json.JSONDecodeError:
                self._json(400, {"error": "invalid json"})
                return
            code = str(payload.get("code") or "").strip()
            if len(code) < 4:
                self._json(400, {"error": "code too short"})
                return
            # Single-user home LAN: any valid-length code returns the fixed token.
            self._json(200, {"token": token})

    return Handler


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8791)
    ap.add_argument(
        "--status-url",
        default="http://127.0.0.1:8790/status.json",
        help="Agent Panel status endpoint (localhost)",
    )
    ap.add_argument("--token-file", required=True)
    ap.add_argument("--poll-seconds", type=float, default=15.0)
    args = ap.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    token = load_token(Path(args.token_file))
    if len(token) < 16:
        raise SystemExit("token too short")

    cache = SnapshotCache(args.status_url, args.poll_seconds)
    cache.start()

    handler = make_handler(cache, token)
    server = ThreadingHTTPServer((args.host, args.port), handler)
    LOG.info(
        "quota bridge on http://%s:%d  status=%s",
        args.host,
        args.port,
        args.status_url,
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
