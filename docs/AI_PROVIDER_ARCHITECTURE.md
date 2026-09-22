# AI provider architecture

The UI never depends on a specific provider. Server code depends on
capability contracts; concrete providers register behind them.

```
UI / route handler
  → AIGateway (src/lib/ai-gateway/registry.ts)
  → TextProvider | ImageProvider | TtsProvider | MusicProvider
    | TranscriptionProvider | RenderingProvider
    (src/lib/ai-gateway/types.ts)
  → Adapter (src/server/ai/*)
  → Vendor / self-hosted service
```

## Capability → adapters

| Capability | Contract | Adapters (primary first) | Env |
|---|---|---|---|
| text | TextProvider | gemini | GEMINI_API_KEY (+GEMINI_TEXT_MODEL) |
| intelligence | requestIntelligence → text | gemini | GEMINI_API_KEY |
| image | ImageProvider | gemini, comfyui | GEMINI_API_KEY / COMFYUI_URL + COMFYUI_WORKFLOW |
| tts | TtsProvider | gemini, piper | GEMINI_API_KEY / PIPER_URL (+PIPER_VOICE) |
| music | MusicProvider | ace-step | ACE_STEP_URL |
| transcription | TranscriptionProvider | whisperx | WHISPERX_URL |
| video (rendering) | RenderingProvider | rendiv (external worker) | RENDIV_URL |
| ingestion/research | PlatformSnapshot / ResearchSource | youtube (Data API → oEmbed → Invidious) | YOUTUBE_API_KEY (+YOUTUBE_FALLBACK_BASE) |

## Rules

- Unconfigured capability → `ProviderNotConfiguredError` (or
  `IntelligenceNotConfiguredError`). Never a fake response, never a
  silent failure, never fake progress.
- `registerGeminiProviders()` registers text/image/tts when the key
  exists; self-hosted adapters construct on demand inside routes/jobs.
- `GET /api/v1/system/providers` exposes the presence-only catalog
  (`describeProviders()`); UI gates features on `configured`.
- Model names resolve from env with documented defaults; per-call
  overrides stay inside server code.
- Generation requests that cost money or quota belong in jobs
  (`src/server/jobs/store.ts`), never awaited inside request handlers.
- Checkpoint/diffusion/TTS voice models carry their own licenses —
  verify per model before use (see OPEN_SOURCE_LICENSE_AUDIT.md).
