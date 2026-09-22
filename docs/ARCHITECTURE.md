# TubeRack Architecture (Phases 1–2)

Greenfield repo. Phase 1 established contracts and quality gates; Phase 2
added the design system and UX foundation. Backend persistence, auth,
providers, workers, and rendering land in later phases (backend = Phase 11).

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
- `src/config/navigation.ts` — single nav source of truth (live/preview/
  planned); `src/config/preview.ts` — explicitly static preview fixtures
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
