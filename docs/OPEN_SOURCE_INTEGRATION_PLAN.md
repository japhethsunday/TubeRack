# Open-source integration plan

## STEP 1 inventory (what exists — verified in-repo)

- Product UI: dashboard, projects, intelligence, script, storyboard, media,
  video (timeline + live preview + export validation), packaging, analytics.
- Gateway: `AIGateway` registry with text/image providers (Gemini live) and
  TTS contract (Gemini live); `ProviderNotConfiguredError` boundaries.
- Media: deterministic SVG drafts, upload/session queue, provider-request
  drafts; provider capability matrix (`on-device` vs gated `ai-provider`).
- Video: composition model (tracks/clips/canvas/snapshots), presets,
  transitions, captions builder, render requests (saved drafts w/ validation).
- Backend (CloudNivo Postgres): auth/sessions/RBAC, workspaces, sync, credits
  ledger, audit log, notifications table, rate limits. No realtime, no
  background runner, no email delivery, no object storage configured.
- Jobs: render requests are inert saved rows — no executor, no generic jobs.
- Media processing: no FFmpeg, no transcription, no local TTS/music,
  no workflow orchestration. 133 hermetic tests, all green.

## Decisions

### INTEGRATE NOW
- **FFmpeg adapter** (`src/server/media/ffmpeg.ts`): availability probe
  (`FFMPEG_PATH` or PATH), `ffprobe` metadata, pure arg builders
  (trim/concat/scale/mix/burn-subtitles/thumbnail), job-based execution
  contract. Disabled state when the binary is absent (Vercel). No commands
  scattered elsewhere. Reason: universal media engine; binary use is
  license-safe; needed by render/transcription pipelines.
- **Gateway contracts**: add `MusicProvider`, `TranscriptionProvider`,
  `RenderingProvider` (+ `transcription` capability) alongside existing
  text/image/tts. Reason: the architecture brief requires these seams;
  additive, no existing behavior changes.
- **Provider registry + presence route**: `describeProviders()` (name, type,
  capabilities, models, local/external, GPU need, configured, health) and
  `GET /api/v1/system/providers` (presence-only, no secrets). Reason: the UI
  must never show generation as available when unconfigured — this is the
  machine-readable source for that.
- **Jobs system**: migration `005_jobs.sql` (workspace-scoped, idempotency
  keys, retry counts, atomic status guards) + `src/server/jobs/store.ts` +
  `/api/v1/jobs` CRUD with cancel/retry actions. Reason: brief mandates a
  job abstraction for generation/render/transcription; render_requests stays
  as the user-facing draft record, jobs are the execution records.

### INTEGRATE THROUGH ADAPTER (config-driven, off by default)
- **WhisperX** (`WHISPERX_URL`): `TranscriptionProvider` returning
  word-level segments + SRT/VTT builders feeding Script → Voice →
  Transcript → Captions → Timeline. GPU docker; CPU tolerated.
- **Piper** (`PIPER_URL`, `PIPER_VOICE`): `TtsProvider` sidecar. CPU OK.
- **ComfyUI** (`COMFYUI_URL`): `ImageProvider` via prompt workflow API.
  GPU required for practical use.
- **ACE-Step** (`ACE_STEP_URL`): `MusicProvider`. GPU required.
- **Rendiv** (`RENDIV_URL`): `RenderingProvider` to a self-hosted
  renderer. App composition stays source of truth; Rendiv never sees our UI.

### REFERENCE ONLY
- **OpenMontage** (AGPL-3.0 — code unusable in SaaS): adopt pipeline
  discipline (research → proposal → script → scenes → assets → edit →
  compose with approval gates), scored provider selection dimensions,
  budget estimate/reserve/reconcile, decision audit trail. Implemented as
  our own provider-scoring notes + job metadata, not copied code.
- **Vanta** (MIT aggregator): adopt its vetted picks/rejects (see license
  audit); do not vendor the aggregator.
- **VideoFlow** (Apache-2.0): VideoJSON discipline — our composition export
  remains portable JSON (already true); no dependency.
- **OpenCut** (MIT): timeline UX patterns only; our design system untouched.

### DO NOT USE
- Wav2Lip (non-commercial), V-Express (research-only), SadTalker
  (abandoned) for avatars; talking-head generation is out of scope.
- Remotion itself (company-license exposure for larger for-profit teams);
  Rendiv/VideoFlow cover the code-first rendering need under Apache-2.0.
- Any paid API as a mandatory dependency (fal, ElevenLabs, Suno, OpenAI —
  all optional, none wired).

## What this phase does NOT do
No editor rebuild, no design-system change, no CloudNivo replacement, no
GPU provisioning, no email provider, no realtime, no E2E harness. Adapters
report unconfigured honestly; the app works fully without them.
