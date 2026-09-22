# Media pipeline

```
Script → Voice → Transcript → Captions → Timeline → Composition
  → RenderJob → FFmpeg / external renderer → Asset (+ ThumbnailVariant)
```

- Transcription: audio → `WhisperXTranscriptionProvider.transcribe()` →
  segments → `toSrt()`/`toVtt()` → existing caption flows. Job type
  `transcription`.
- Voice/music: Gemini TTS, Piper sidecar, ACE-Step → audio bytes →
  media assets + timeline audio tracks. Job types `audio`/`generation`.
- Rendering: composition JSON (tracks/clips/canvas, portable by design —
  cf. VideoFlow's VideoJSON discipline) → `ExternalRenderingProvider`
  (Rendiv-compatible worker) or FFmpeg assembly for deterministic
  compositions. Job type `render`. Existing `render_requests` stay the
  user-facing drafts; `jobs` rows track execution.
- FFmpeg (`src/server/media/ffmpeg.ts`): availability probe, `ffprobe`
  validation gates, pure arg builders (trim/concat/scale/mix/burn-subtitles/
  thumbnail), `runFFmpeg()` with stderr `time=` progress. Long runs execute
  from a background runner that claims jobs, reports progress, and
  completes/fails them — never inside API requests.
- Assets stay the single media system: every generated file lands in
  `media_assets` with workspace scoping; approval flows unchanged.

## Self-hosted service contracts

### WhisperX (`WHISPERX_URL`)
`POST /transcribe` `{audio_base64, mime_type, language}` →
`{text, language, segments: [{start, end, text}]}`. GPU docker for
throughput; CPU tolerated. (faster-whisper, whisper.cpp, sherpa-onnx can
serve the same `TranscriptionProvider` shape.)

### Piper (`PIPER_URL`)
`POST /synthesize` `{text, voice}` →
`{audio_base64, mime_type}`. CPU-friendly. Default voice
`en_US-lessac-medium`. Verify each voice model's license before use.
(Piper's own `docs/API_HTTP.md` documents its HTTP server.)

### ComfyUI (`COMFYUI_URL` + `COMFYUI_WORKFLOW`)
Standard prompt API: `POST /prompt` → `{prompt_id}`, poll
`GET /history/{id}`, fetch `GET /view`. `COMFYUI_WORKFLOW` is a workflow
JSON template with `{{PROMPT}}` / `{{ASPECT}}` tokens. GPU required.

### ACE-Step (`ACE_STEP_URL`)
`POST /compose` `{prompt, duration_sec}` →
`{audio_base64, mime_type}`. GPU required.

### Render worker (`RENDIV_URL`)
`POST /v1/renders` `{composition, format}` → `{job_id}`;
`GET /v1/renders/:id` → `{status, url?}`. Runner needs Node + headless
Chromium + FFmpeg. Poll from a background runner and complete/fail the
corresponding `jobs` row; download the MP4 into object storage / assets.

## What runs where

| Environment | Available now | Not available |
|---|---|---|
| Local dev (this machine) | All contracts, arg builders, probes report honestly | FFmpeg binary, GPU services (not installed) |
| Vercel serverless | Contracts, validation, job records | FFmpeg/Chromium/GPU execution (use a self-hosted runner) |
| Self-hosted runner (future) | Full execution via job claiming | — |

## Deployment order for execution

1. Provision a host with Docker + optional NVIDIA GPU.
2. Run WhisperX / Piper / ComfyUI / ACE-Step containers; set the `*_URL`s.
3. Install FFmpeg; set `FFMPEG_PATH`.
4. Run the Rendiv-compatible render worker; set `RENDIV_URL`.
5. Run a job-runner loop (claim → execute → progress → complete/fail)
   against the CloudNivo database. Keep the database authoritative;
   realtime updates stay optional.
