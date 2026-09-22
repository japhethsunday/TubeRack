# TubeRack Architecture (Phases 1–8)

Greenfield repo. Phases 1–7 built contracts, design system, auth UX,
device-local workspace, deterministic intelligence, script/story studios,
and on-device media. Phase 8 added the video composition studio. Workers
and cloud remain Phase 11.

## Stack

- Next.js 16 App Router (`app/`), React 19, TypeScript strict, Tailwind v4
- `zod` for server env + input validation
- `lucide-react` for iconography (single icon set, no ad-hoc SVGs)
- `tsx --test` for unit + server-render component tests (Node 20+)
- No database, no auth, no queue — by design until their phases

## Structure

- `app/` — `page`, shell group `(app)/` (dashboard, projects,
  preview workspace, design gallery), `loading`/`error`/`not-found`/
  `global-error`, `api/health`, `api/version`
- `src/design/tokens.ts` — semantic colors (light/dark), type, spacing,
  radius; mapped to Tailwind utilities in `app/globals.css`
- `src/lib/auth/` — validation schemas, strength scorer, error map,
  session helpers, `AuthNotIntegratedError`; no sessions, no storage
- `app/(auth)/` — login, signup, forgot/reset password, verify, onboarding
- `app/(app)/settings/` — profile, preferences, notifications, security,
  sessions, workspace, billing, data (preview-only until Phase 11)
- `src/types/domain.ts` — lifecycle stages, job statuses, usage kinds,
  AI capabilities, credit + project contracts
- `src/lib/env.ts` — server-only env validation (never `NEXT_PUBLIC_*` secrets)
- `src/lib/ai-gateway/` — provider-independent registry; unconfigured
  capability throws `ProviderNotConfiguredError`, never a fake response
- `src/lib/jobs/machine.ts` — pure recoverable job state machine
- `src/lib/credits/ledger.ts` — central usage/credit math (pure)
- `src/lib/project/lifecycle.ts` — ordered 15-stage pipeline helpers
- `src/components/ui/` — full component system (buttons → dialogs →
  tables → states); `src/components/shell/` — AppShell, sidebar, header;
  `src/components/patterns/` — AI panel, media, progress, editor, dialogs
- `src/lib/intelligence/` — task registry, deterministic analyzers
  (idea/angles, titles, hooks, retention, gaps), audience/strategy profiles,
  DNA, context assembler, intel shelf ops
- `src/lib/ai-gateway/intelligence.ts` — future provider path (throws until
  Phase 11); research + platform contracts
- `src/components/intelligence/` — provider (DNA/intel/opportunities),
  TaskRunner lifecycle, structured-output primitives
- `app/(app)/intelligence/` — hub + lab/audience/strategy/titles/hooks/
  retention/gaps; project overview links per-studio intel via `?project=`
- `app/(app)/studio/` — script (context/editor/tools), storyboard (scenes,
  timeline, sync), media (library, scene needs, image/video/voice/music/
  sfx/uploads/style/queue), video (composition, preview, timeline, export);
  overview + dashboard route into the studios
- `src/lib/video/` — composition model, presets, auto-build, validation,
  timeline ops; `src/components/video/` — provider (history, snapshots,
  requests), timeline, synchronized preview, studio panels
- `src/lib/media/` — types, capability matrix, SVG drafts, prompt assembly,
  audio recipes, upload validation; `src/components/media/` — provider,
  players (exclusive playback), library, studios, uploads, queue
- `src/lib/script/` — formats, measure, claims/refs, engine (assembly, ops,
  versions, loops, scenes), review; `src/components/script/` — provider,
  section/scene cards, generation dialog, studio panels
- `src/lib/projects/` — project/channel/activity domain, pure store ops,
  zod-validated versioned bundle (`tuberack.workspace.v1`)
- `src/components/projects/` — provider, cards, toolbar, dialogs, pipeline,
  activity feed; `app/(app)/` — dashboard, projects, `projects/[id]`,
  activity, preview, design, settings
- `src/config/navigation.ts` — single nav source of truth (live/preview/
  planned); `src/config/preview.ts` + `identity.ts` — explicitly static fixtures
- Intelligence is local-first: deterministic heuristics with disclosed
  methodology stand in for provider reasoning; structures (context, DNA,
  briefs, versions) are provider-ready.
- Device-local first: user-created data persists in the browser with UI
  disclosure; nothing is presented as cloud-backed.
- No auth middleware by decision: a pass-through proxy would imply fake
  protection (`SESSION_ENFORCEMENT.enforced = false`).
- `tests/` — unit tests for the above
- `docs/` — architecture, phase status, decisions, boundaries
- `docker-compose.yml` — Phase 11 self-host target (not active in Phase 1)

## Key decisions

- Provider independence from day one: app code depends on gateway
  interfaces, never on a vendor SDK.
- Jobs are recoverable: `queued → processing → completed | failed | cancelled`,
  with `retrying` and re-queue paths. Render failures never restart everything.
- Credits are central: every expensive operation (`text/image/video/voice/
  music/render/transcription/research`) flows through one ledger helper.
- Project context is unified: each stage's output is structured input to the next.
- Secrets are server-only: validated in `src/lib/env.ts`, consumed only in
  route handlers / server code / workers (Phase 11).
- No hard-coded palette colors in components: tokens or nothing (audited).
- Navigation states are explicit: `live` routes work, `preview` renders
  labeled static layouts, `planned` is disabled with its owning phase.

## Self-host target (Phase 11)

API + Postgres + Redis/queue + render/FFmpeg workers + object storage +
monitoring/logging/scheduled jobs. External services only where they add
substantial value (models, TTS, email, payments). See `docker-compose.yml`
and `docs/INTEGRATION_BOUNDARIES.md`.
