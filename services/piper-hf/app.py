"""
TubeRack voice server: Piper text-to-speech over HTTP.

POST /synthesize   {"text": "...", "voice": "en_US-ryan-high", "speed": 1.0}
                   Authorization: Bearer <PIPER_TOKEN>   ->  audio/wav
GET  /health       ->  {"ok": true, "voices": [...]}

Runs on Hugging Face Spaces (Docker, port 7860). Voices are baked into the
image at build time; PIPER_TOKEN is a Space secret.
"""
import hmac
import io
import json
import os
import threading
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

VOICES_DIR = Path(os.environ.get("VOICES_DIR", "/app/voices"))
TOKEN = os.environ.get("PIPER_TOKEN", "")
DEFAULT_VOICE = os.environ.get("DEFAULT_VOICE", "en_US-ryan-medium")
MAX_CHARS = 6000

_voices = {}
_lock = threading.Lock()


def available():
    return sorted(p.stem for p in VOICES_DIR.glob("*.onnx"))


def voice(name):
    """Load a voice once and reuse it (loading takes a second or two)."""
    with _lock:
        if name not in _voices:
            from piper import PiperVoice

            model = VOICES_DIR / f"{name}.onnx"
            if not model.exists():
                raise KeyError(name)
            _voices[name] = PiperVoice.load(str(model))
        return _voices[name]


def synthesize(text, name, speed):
    from piper import SynthesisConfig

    v = voice(name)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav:
        # Piper's length_scale: bigger = slower. speed 1.1 -> 0.91.
        v.synthesize_wav(text, wav, syn_config=SynthesisConfig(length_scale=1.0 / max(0.5, min(2.0, speed))))
    return buf.getvalue()


class Handler(BaseHTTPRequestHandler):
    server_version = "TubeRackVoice/1.0"

    def _send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):  # keep request text out of the logs
        pass

    def do_GET(self):
        if self.path in ("/", "/health"):
            return self._send(200, {"ok": True, "voices": available(), "default": DEFAULT_VOICE})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/synthesize":
            return self._send(404, {"error": "not found"})
        if not TOKEN:
            return self._send(503, {"error": "PIPER_TOKEN is not set on the server"})
        auth = self.headers.get("Authorization", "")
        if not hmac.compare_digest(auth.encode(), f"Bearer {TOKEN}".encode()):
            return self._send(401, {"error": "unauthorized"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 200_000:
                return self._send(400, {"error": "bad request size"})
            req = json.loads(self.rfile.read(length))
            text = str(req.get("text", "")).strip()
            name = str(req.get("voice") or DEFAULT_VOICE)
            speed = float(req.get("speed") or 1.0)
        except (ValueError, TypeError):
            return self._send(400, {"error": "invalid JSON"})
        if not text or len(text) > MAX_CHARS:
            return self._send(400, {"error": f"text must be 1-{MAX_CHARS} characters"})
        try:
            audio = synthesize(text, name, speed)
        except KeyError:
            return self._send(400, {"error": f"unknown voice; available: {available()}"})
        except Exception as exc:  # noqa: BLE001 - report, never crash the server
            return self._send(500, {"error": f"synthesis failed: {type(exc).__name__}"})
        self._send(200, audio, "audio/wav")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "7860"))
    print(f"TubeRack voice server on :{port} with voices {available()}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
