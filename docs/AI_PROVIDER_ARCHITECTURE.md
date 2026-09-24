# AI provider architecture

The UI never depends on a specific provider.

```
UI (studios)
  → API route (/api/v1/ai/*  instant cloud calls | /api/v1/generate  queued jobs)
  → Gateway  src/server/ai/gateway.ts   (capability → first configured adapter, or a named one)
  → Contract src/lib/ai-gateway/types.ts (Text | Image | Tts | Music | Transcription | Rendering)
  → Adapter  src/server/ai/*.ts          (gemini, comfyui, piper, ace-step, whisperx, rendiv)
  → Vendor API / self-hosted service
```

## Capability → adapters

| Capability | Contract | Adapters | Path | Env |
|---|---|---|---|---|
| text / intelligence / script / packaging | TextProvider | gemini | instant (`/api/v1/ai/*`) | GEMINI_API_KEY |
| image | ImageProvider | gemini (instant), comfyui (job) | both | GEMINI_API_KEY / COMFYUI_URL + COMFYUI_WORKFLOW (+COMFYUI_API_KEY) |
| tts | TtsProvider | gemini (instant), piper (job) | both | GEMINI_API_KEY / PIPER_URL (+PIPER_VOICE) |
| music | MusicProvider | ace-step | job | ACE_STEP_URL |
| transcription | TranscriptionProvider | whisperx | job | WHISPERX_URL |
| rendering | RenderingProvider | rendiv-compatible worker | job | RENDIV_URL |
| research / ingestion | YouTube client | Data API → oEmbed → Invidious | instant | YOUTUBE_API_KEY (+YOUTUBE_FALLBACK_BASE) |
| media processing | FFmpeg service | local binary | worker | FFMPEG_PATH |

## Provider registry

`describeProviders()` (`src/server/ai/registry.ts`) lists provider, type,
capabilities, models, local/external, GPU requirement, configured, and a
human detail line. `GET /api/v1/system/providers?health=1` adds live
health: self-hosted services get a 3-second probe (`healthy` /
`unreachable`); cloud APIs report `configured` without spending quota.
No URLs, keys, or secrets are ever returned.

The media studios merge this into their provider pickers
(`withAvailability()` in `src/lib/media/providers.ts`): ComfyUI, Piper,
and ACE-Step only become selectable when configured **and** healthy;
otherwise the option explains exactly which variable is missing.

## Rules

- Unconfigured → `ProviderNotConfiguredError` → HTTP 503
  `BACKEND_UNAVAILABLE` with a precise message. Never fake output,
  never fake progress, never silent failure.
- Paid/quota calls require sign-in, are rate-limited per user
  (`expensive` class), and are recorded in `usage_events`.
- Self-hosted providers (slow, GPU) never run inside a request: they go
  through `/api/v1/generate` → `jobs` → worker.
- Model licenses (checkpoints, voices) are verified per model — see
  OPEN_SOURCE_LICENSE_AUDIT.md.
