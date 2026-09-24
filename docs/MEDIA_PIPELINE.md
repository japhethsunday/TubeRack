# Media pipeline

```
Script → Voice (Gemini | Piper) → stored WAV → Transcript (WhisperX) → Captions → Timeline
Image  (Gemini | ComfyUI) → stored PNG → Asset → Scene → Timeline
Music  (ACE-Step)         → stored WAV → Asset → Timeline music track
Timeline composition → Render job (Rendiv worker) → stored MP4 → download
```

## Storage (Supabase, private bucket `media`)

- Keys are always built server-side: `<workspaceId>/generated/<uuid>-output.<ext>`
  for provider output and `<workspaceId>/uploads/<uuid>.<ext>` for uploads.
- The browser only ever holds app URLs (`/api/v1/generated/…`,
  `/api/v1/uploads/…`). Those routes check the session and workspace
  membership, then 302 to a 1-hour signed URL (works for video seeking and
  avoids the 4.5 MB serverless response cap).
- Uploads use a signed **upload** URL (`POST /api/v1/uploads/sign`): the
  server chooses the key and validates type (PNG/JPEG/GIF/WebP/MP4/WebM/
  MP3/WAV/OGG) and size (≤ 200 MB); bytes go browser → Supabase directly.
- Every generated or uploaded file becomes a media asset with source
  `provider-output` (payload = app URL), so the library, approvals, scene
  assignment, video preview, and sync all treat it like any other asset.

## Jobs

`jobs` table (migration 005): workspace, project, actor, type
(`generation` | `audio` | `transcription` | `render`), provider, model,
status (`queued` → `processing` → `completed` | `failed` | `cancelled` |
`retrying`), input, output, progress, error, attempts / max_attempts,
idempotency key, timestamps.

- `POST /api/v1/generate` validates input per type (zod, `JOB_INPUTS`),
  confirms the provider is configured, and queues the job.
- `GET /api/v1/jobs/:id` polls; `PATCH /api/v1/jobs/:id {action}` cancels
  or retries.
- Runner (`src/server/jobs/runner.ts`): claim (atomic) → execute through
  the gateway → store output → complete. Provider errors retry until
  `max_attempts`; malformed input and missing files fail permanently.
  Cancellation is checked between steps.
- Worker (`npm run worker`, `src/worker/index.ts`): polls every 3 s,
  runs `WORKER_CONCURRENCY` jobs, drains on SIGTERM. It needs a
  long-running host; Vercel functions are not used for this.

## FFmpeg

`src/server/media/ffmpeg.ts` is the only place FFmpeg is invoked:
availability probe, `ffprobe` metadata, arg builders (trim, concat, scale,
mix, burn subtitles, thumbnail) and `runFFmpeg()` with progress. Absent on
Vercel, so it reports unavailable there.

## Self-hosted service contracts

| Service | Request | Response | Hardware |
|---|---|---|---|
| WhisperX `WHISPERX_URL` | `POST /transcribe {audio_base64, mime_type, language}` | `{text, language, segments:[{start,end,text}]}` | GPU recommended (≈ 4–10 GB VRAM for large-v2/v3); CPU works slowly |
| Piper `PIPER_URL` | `POST /synthesize {text, voice}` | `{audio_base64, mime_type}` | CPU; ~60 MB per voice |
| ComfyUI `COMFYUI_URL` | `POST /prompt`, `GET /history/:id`, `GET /view` | image bytes | GPU; ≥ 8 GB VRAM for SDXL-class checkpoints |
| ACE-Step `ACE_STEP_URL` | `POST /compose {prompt, duration_sec}` | `{audio_base64, mime_type}` | GPU; ≈ 8+ GB VRAM |
| Render worker `RENDIV_URL` | `POST /v1/renders {composition, format}`, `GET /v1/renders/:id` | `{job_id}` / `{status, url}` | CPU; Node + headless Chromium + FFmpeg |

Before rendering, the runner replaces app media URLs in the composition
with 2-hour signed URLs, scoped to the job's own workspace.

## What runs where

| Environment | Runs |
|---|---|
| Vercel (app) | UI, auth, sync, Gemini/YouTube instant calls, job creation/polling, signed URLs |
| Worker host (you provide) | `npm run worker`, FFmpeg, and access to the self-hosted services |
| GPU host (you provide) | ComfyUI, WhisperX, ACE-Step containers |
