"""
Piper TTS sidecar for TubeRack (Piper engine: GPL-3.0, runs as a separate
process; TubeRack talks to it over HTTP only).

POST /synthesize {"text": str, "voice"?: str} -> {"audio_base64", "mime_type", "voice"}
GET  /            -> health + installed voices
Optional auth: set PIPER_TOKEN and send "Authorization: Bearer <token>".
"""
import base64
import io
import os
import wave
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from piper import PiperVoice
from pydantic import BaseModel, Field

VOICES_DIR = Path(os.environ.get("PIPER_VOICES_DIR", "/voices"))
DEFAULT_VOICE = os.environ.get("PIPER_DEFAULT_VOICE", "en_US-lessac-medium")
TOKEN = os.environ.get("PIPER_TOKEN", "")

app = FastAPI(title="TubeRack Piper")
_loaded: dict[str, PiperVoice] = {}


def installed() -> list[str]:
    return sorted(p.stem for p in VOICES_DIR.glob("*.onnx"))


def voice_for(name: str | None) -> tuple[str, PiperVoice]:
    wanted = name if name and name in installed() else DEFAULT_VOICE
    if wanted not in _loaded:
        model = VOICES_DIR / f"{wanted}.onnx"
        if not model.exists():
            raise HTTPException(status_code=500, detail=f"voice {wanted} is not installed")
        _loaded[wanted] = PiperVoice.load(model)
    return wanted, _loaded[wanted]


class SynthesizeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    voice: str | None = Field(default=None, max_length=80)


@app.get("/")
def health():
    return {"ok": True, "voices": installed(), "default": DEFAULT_VOICE}


@app.post("/synthesize")
def synthesize(req: SynthesizeRequest, authorization: str | None = Header(default=None)):
    if TOKEN and authorization != f"Bearer {TOKEN}":
        raise HTTPException(status_code=401, detail="unauthorized")
    name, voice = voice_for(req.voice)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        voice.synthesize_wav(req.text, wav)
    data = buffer.getvalue()
    if len(data) <= 44:
        raise HTTPException(status_code=500, detail="empty audio")
    return {"audio_base64": base64.b64encode(data).decode("ascii"), "mime_type": "audio/wav", "voice": name}


# Warm the default voice so the first request is fast.
try:
    voice_for(None)
except HTTPException:
    pass
