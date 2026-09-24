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
- Backend (Postgres, now on Supabase): auth/sessions/RBAC, workspaces, sync, credits
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
No editor rebuild, no design-system change, no GPU provisioning, no email provider, no realtime, no E2E harness. Adapters
report unconfigured honestly; the app works fully without them.

## Phase 13 — execution wiring (what changed)

Phase 12 delivered adapters that nothing called. Phase 13 connects them
without replacing any module:

| Area | Before | After |
|---|---|---|
| Routing | Routes imported Gemini directly | `src/server/ai/gateway.ts` picks the adapter per capability |
| Registry | Presence only | + live health probes (`?health=1`) |
| Jobs | Table + CRUD, no executor | `POST /api/v1/generate`, runner, `npm run worker` |
| Image studio | Gemini / on-device | + ComfyUI option (job) when healthy |
| Voice studio | Gemini / system voice | + Piper option (job) when healthy |
| Music studio | On-device synth | + ACE-Step option (job) when healthy |
| Video Studio | Narration-derived captions, saved render requests | + WhisperX word-timed captions, + Rendiv render → MP4 (both jobs, shown only when healthy) |
| Storage | Signed uploads + generated files | Job outputs use the same private bucket and owner-checked links |

### Decisions (unchanged categories)

- INTEGRATE NOW: FFmpeg service, provider contracts, registry + health, jobs + worker.
- INTEGRATE THROUGH ADAPTER: WhisperX, Piper, ComfyUI, ACE-Step, Rendiv (all off unless configured).
- REFERENCE ONLY: OpenMontage (AGPL), Vanta, VideoFlow, OpenCut.
- DO NOT USE: Wav2Lip, V-Express, SadTalker, Remotion.

### Supabase decisions

- **Auth stays TubeRack's own** (users / hashed sessions / tokens in
  Postgres). Migrating to Supabase Auth would mean a second auth system or
  a rewrite of every route; the brief forbids both. Documented, not changed.
- **RLS**: enabled on every public table; `anon` and `authenticated` hold
  no grants and no policies, so the Supabase REST/GraphQL endpoints expose
  nothing even with the public key. The app connects as the least-privilege
  `tuberack_app` role (no superuser, no BYPASSRLS) and enforces tenant
  isolation in `src/server/authz.ts` + workspace-scoped SQL. Row-level
  tenant policies keyed to a per-request session variable would require
  wrapping every query in a transaction — deferred, see "Known limitations".
- **Storage**: one private bucket, workspace-prefixed keys, signed URLs only.

### Known limitations

- Execution needs infrastructure you run: a worker host and, for ComfyUI /
  WhisperX / ACE-Step, a GPU host. Without them those options stay hidden.
- Tenant isolation at the database layer is role-level (public roles
  locked out), not per-workspace RLS; per-workspace isolation is enforced
  by the application layer.
- Render assumes a Rendiv-compatible worker API; Rendiv itself is not
  vendored.

## Phase 14 — self-hosted integrations removed (product decision)

The owner chose hosted APIs over self-hosted infrastructure. Removed from
the codebase and deployments: ComfyUI, Piper, ACE-Step, WhisperX and Rendiv
adapters, the FFmpeg service, the job runner/worker, `/api/v1/generate`,
the Piper sidecar, and the Railway services that ran them. All five move to
**REFERENCE ONLY**. Replacements: Gemini images, Gemini TTS, and Gemini
audio transcription for captions. Music uses on-device beds or uploads;
MP4 rendering is not offered. The `jobs` table and `/api/v1/jobs` remain for
future hosted long-running work.
