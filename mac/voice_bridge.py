#!/usr/bin/env python3
"""Watch voice bridge: receive audio, transcribe, confirm-send (paste).

Endpoints (Bearer token required except /health):
  POST /v1/transcribe   multipart: file=<audio>
  POST /v1/send         JSON: {"text":"...", "mode":"paste"|"clipboard"}
  GET  /health
"""

from __future__ import annotations

import argparse
import hmac
import json
import logging
import os
import shutil
import subprocess
import tempfile
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Optional
from urllib.parse import parse_qs, urlparse

LOG = logging.getLogger("voice-bridge")

MAX_AUDIO_BYTES = 12 * 1024 * 1024  # 12 MB


def load_token(path: Path) -> str:
    return path.expanduser().read_text(encoding="utf-8").strip()


def run_cmd(cmd: list[str], timeout: float = 180) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def convert_to_caf(src: Path, dst: Path) -> None:
    """Normalize to m4a/caf that SFSpeech accepts well."""
    # Prefer m4a aac
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(src),
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "aac",
        str(dst),
    ]
    proc = run_cmd(cmd, timeout=60)
    if proc.returncode != 0 or not dst.is_file():
        raise RuntimeError(proc.stderr[-500:] if proc.stderr else "ffmpeg failed")


def _locale_to_whisper_lang(locale: str) -> str:
    loc = (locale or "zh-CN").lower()
    if loc.startswith("zh"):
        return "zh"
    if loc.startswith("en"):
        return "en"
    if loc.startswith("ja"):
        return "ja"
    return "auto"


def _pick_whisper_model() -> Path:
    """Prefer larger models when fully downloaded."""
    root = Path.home() / ".agent-panel/bridge/models"
    candidates = [
        ("ggml-large-v3-turbo.bin", 1_400_000_000),  # ~1.5GB
        ("ggml-medium.bin", 1_400_000_000),
        ("ggml-small.bin", 450_000_000),  # ~466MB
        ("ggml-base.bin", 100_000_000),
    ]
    for name, min_size in candidates:
        p = root / name
        try:
            if p.is_file() and p.stat().st_size >= min_size:
                return p
        except OSError:
            continue
    raise RuntimeError("whisper model missing")


def transcribe_with_whisper(wav: Path, locale: str) -> str:
    model = _pick_whisper_model()
    lang = _locale_to_whisper_lang(locale)
    # Bias toward coding / Chinese tech dictation
    prompt = (
        "这是中文编程语音输入，可能包含 Claude、Codex、Grok、API、函数、变量、"
        "文件路径、git、commit、refactor、bug、测试、部署。"
    )
    cmd = [
        "whisper-cli",
        "-m",
        str(model),
        "-f",
        str(wav),
        "-l",
        lang,
        "-bs",
        "5",
        "-bo",
        "5",
        "--prompt",
        prompt,
        "-nt",
        "-np",
    ]
    LOG.info("whisper model=%s lang=%s", model.name, lang)
    proc = run_cmd(cmd, timeout=300)
    out = (proc.stdout or "").strip()
    if proc.returncode != 0 and not out:
        raise RuntimeError((proc.stderr or "whisper failed")[-800:])
    lines = [
        ln.strip()
        for ln in out.splitlines()
        if ln.strip()
        and not ln.strip().startswith("whisper_")
        and not ln.strip().startswith("ggml_")
        and not ln.strip().startswith("load_")
        and not ln.strip().startswith("system_info")
        and "main:" not in ln[:20]
        and "metal" not in ln.lower()[:30]
    ]
    text = " ".join(lines).strip()
    if not text:
        text = out.splitlines()[-1].strip() if out else ""
    if not text:
        raise RuntimeError("empty transcript")
    # Light cleanup of common whisper artifacts + coding term fixes
    text = text.replace("字幕by索兰娅", "").replace("字幕 by", "").strip()
    text = _fix_coding_terms(text)
    return text


def _fix_coding_terms(text: str) -> str:
    """Heuristic fixes for common Chinese STT mistakes in coding dictation."""
    pairs = [
        ("Cloud", "Claude"),
        ("cloud", "Claude"),
        ("克劳德", "Claude"),
        ("扣打", "Codex"),
        ("code X", "Codex"),
        ("Code X", "Codex"),
        ("狗克", "Grok"),
        ("Groq", "Grok"),  # only when user means xAI Grok; can reverse if needed
        ("一部", "异步"),
        ("异部", "异步"),
        ("git commit", "git commit"),
        ("该它", "git"),
        ("盖特", "git"),
        ("艾皮艾", "API"),
        ("A P I", "API"),
        ("函数树", "函数"),
        ("变脸", "变量"),
        ("文建", "文件"),
        ("部属", "部署"),
        ("单测", "单元测试"),
    ]
    out = text
    for a, b in pairs:
        out = out.replace(a, b)
    return out


def convert_to_wav(src: Path, dst: Path) -> None:
    # Normalize loudness + denoise-ish highpass for watch mics
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(src),
        "-ac",
        "1",
        "-ar",
        "16000",
        "-af",
        "highpass=f=80,loudnorm=I=-16:TP=-1.5:LRA=11",
        str(dst),
    ]
    proc = run_cmd(cmd, timeout=60)
    if proc.returncode != 0 or not dst.is_file():
        # Fallback plain convert
        cmd2 = [
            "ffmpeg",
            "-y",
            "-i",
            str(src),
            "-ac",
            "1",
            "-ar",
            "16000",
            str(dst),
        ]
        proc2 = run_cmd(cmd2, timeout=60)
        if proc2.returncode != 0 or not dst.is_file():
            raise RuntimeError(proc.stderr[-500:] if proc.stderr else "ffmpeg wav failed")


def transcribe_file(swift_path: Path, audio: Path, locale: str) -> str:
    # Primary: local whisper-cpp (no Speech TCC). Fallback: Apple Speech app binary.
    wav = audio.with_suffix(".wav")
    if audio.suffix.lower() != ".wav":
        convert_to_wav(audio, wav)
    else:
        wav = audio
    try:
        return transcribe_with_whisper(wav, locale)
    except Exception as whisper_err:  # noqa: BLE001
        LOG.warning("whisper failed, trying Apple Speech: %s", whisper_err)
        bin_path = (
            Path.home()
            / ".agent-panel/bridge/VoiceTranscribe.app/Contents/MacOS/VoiceTranscribe"
        )
        cmd = (
            [str(bin_path), str(audio), locale]
            if bin_path.is_file()
            else ["/usr/bin/swift", str(swift_path), str(audio), locale]
        )
        proc = run_cmd(cmd, timeout=150)
        if proc.returncode != 0:
            raise RuntimeError(
                f"whisper: {whisper_err}; speech: {(proc.stderr or proc.stdout or '')[-400:]}"
            ) from whisper_err
        data = json.loads(proc.stdout.strip() or "{}")
        text = str(data.get("text") or "").strip()
        if not text:
            raise RuntimeError("empty transcript") from whisper_err
        return text


def paste_text(text: str, mode: str = "paste") -> None:
    """Put text on clipboard; optionally Cmd+V into frontmost app."""
    # Use pbcopy
    p = subprocess.run(["pbcopy"], input=text.encode("utf-8"), check=False)
    if p.returncode != 0:
        raise RuntimeError("pbcopy failed")
    if mode == "clipboard":
        return
    # Accessibility may be required for keystroke
    script = '''
    tell application "System Events"
      keystroke "v" using command down
    end tell
    '''
    proc = run_cmd(["osascript", "-e", script], timeout=10)
    if proc.returncode != 0:
        # Fall back silently to clipboard-only
        LOG.warning("paste keystroke failed, left on clipboard: %s", proc.stderr.strip())


def parse_multipart(body: bytes, content_type: str) -> dict[str, Any]:
    """Minimal multipart parser for a single file field."""
    if "boundary=" not in content_type:
        raise ValueError("missing boundary")
    boundary = content_type.split("boundary=", 1)[1].strip()
    if boundary.startswith('"') and boundary.endswith('"'):
        boundary = boundary[1:-1]
    delim = ("--" + boundary).encode()
    parts = body.split(delim)
    fields: dict[str, Any] = {}
    for part in parts:
        if not part or part in (b"--\r\n", b"--", b"\r\n"):
            continue
        if part.startswith(b"--"):
            continue
        if part.startswith(b"\r\n"):
            part = part[2:]
        if part.endswith(b"\r\n"):
            part = part[:-2]
        header_blob, _, data = part.partition(b"\r\n\r\n")
        if data.endswith(b"\r\n"):
            data = data[:-2]
        headers = header_blob.decode("utf-8", errors="replace")
        name = None
        filename = None
        for line in headers.split("\r\n"):
            if line.lower().startswith("content-disposition:"):
                # form-data; name="file"; filename="a.m4a"
                for token in line.split(";"):
                    token = token.strip()
                    if token.startswith("name="):
                        name = token.split("=", 1)[1].strip('"')
                    elif token.startswith("filename="):
                        filename = token.split("=", 1)[1].strip('"')
        if name:
            fields[name] = {"filename": filename or name, "data": data}
    return fields


class VoiceState:
    def __init__(self, token: str, swift_path: Path, work_dir: Path) -> None:
        self.token = token
        self.swift_path = swift_path
        self.work_dir = work_dir
        self.work_dir.mkdir(parents=True, exist_ok=True)


def make_handler(state: VoiceState):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt: str, *args: Any) -> None:
            LOG.info("%s - %s", self.address_string(), fmt % args)

        def _send(self, code: int, obj: Any) -> None:
            body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def _auth(self) -> bool:
            auth = self.headers.get("Authorization", "")
            if not auth.startswith("Bearer "):
                return False
            return hmac.compare_digest(auth[7:].strip(), state.token)

        def do_GET(self) -> None:  # noqa: N802
            path = urlparse(self.path).path
            if path == "/health":
                self._send(200, {"status": "ok", "service": "voice-bridge"})
                return
            self._send(404, {"error": "not found"})

        def do_POST(self) -> None:  # noqa: N802
            path = urlparse(self.path).path
            if not self._auth():
                self._send(401, {"error": "unauthorized"})
                return

            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0 or length > MAX_AUDIO_BYTES + 64_000:
                self._send(400, {"error": "invalid content length"})
                return
            body = self.rfile.read(length)

            if path == "/v1/transcribe":
                self._handle_transcribe(body)
                return
            if path == "/v1/send":
                self._handle_send(body)
                return
            self._send(404, {"error": "not found"})

        def _handle_transcribe(self, body: bytes) -> None:
            ctype = self.headers.get("Content-Type", "")
            locale = "zh-CN"
            # allow ?locale=
            qs = parse_qs(urlparse(self.path).query)
            if "locale" in qs and qs["locale"]:
                locale = qs["locale"][0]

            job = uuid.uuid4().hex[:12]
            job_dir = state.work_dir / job
            job_dir.mkdir(parents=True, exist_ok=True)
            try:
                if "multipart/form-data" in ctype:
                    fields = parse_multipart(body, ctype)
                    file_field = fields.get("file") or fields.get("audio")
                    if not file_field:
                        self._send(400, {"error": "missing file field"})
                        return
                    raw_name = file_field["filename"] or "audio.m4a"
                    src = job_dir / Path(raw_name).name
                    src.write_bytes(file_field["data"])
                else:
                    # raw body as m4a
                    src = job_dir / "audio.bin"
                    src.write_bytes(body)

                if src.stat().st_size < 32:
                    self._send(400, {"error": "audio too small"})
                    return

                normalized = job_dir / "audio.m4a"
                try:
                    convert_to_caf(src, normalized)
                    audio_for_stt = normalized
                except Exception:  # noqa: BLE001
                    audio_for_stt = src
                t0 = time.time()
                text = transcribe_file(state.swift_path, audio_for_stt, locale)
                ms = int((time.time() - t0) * 1000)
                LOG.info("transcribed job=%s chars=%d ms=%d", job, len(text), ms)
                self._send(
                    200,
                    {
                        "id": job,
                        "text": text,
                        "locale": locale,
                        "durationMs": ms,
                    },
                )
            except Exception as exc:  # noqa: BLE001
                LOG.exception("transcribe failed")
                self._send(500, {"error": str(exc)[:500]})
            finally:
                shutil.rmtree(job_dir, ignore_errors=True)

        def _handle_send(self, body: bytes) -> None:
            try:
                payload = json.loads(body.decode("utf-8"))
            except json.JSONDecodeError:
                self._send(400, {"error": "invalid json"})
                return
            text = str(payload.get("text") or "").strip()
            mode = str(payload.get("mode") or "paste")
            if not text:
                self._send(400, {"error": "empty text"})
                return
            if len(text) > 20_000:
                self._send(400, {"error": "text too long"})
                return
            try:
                paste_text(text, mode=mode)
                self._send(200, {"ok": True, "mode": mode, "chars": len(text)})
            except Exception as exc:  # noqa: BLE001
                self._send(500, {"error": str(exc)[:300]})

    return Handler


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8792)
    ap.add_argument("--token-file", required=True)
    ap.add_argument(
        "--swift",
        default=str(Path.home() / ".agent-panel/bridge/transcribe.swift"),
    )
    ap.add_argument(
        "--work-dir",
        default=str(Path.home() / ".agent-panel/state/voice-jobs"),
    )
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    token = load_token(Path(args.token_file))
    state = VoiceState(token, Path(args.swift), Path(args.work_dir))
    handler = make_handler(state)
    server = ThreadingHTTPServer((args.host, args.port), handler)
    LOG.info("voice bridge http://%s:%d", args.host, args.port)
    server.serve_forever()


if __name__ == "__main__":
    main()
