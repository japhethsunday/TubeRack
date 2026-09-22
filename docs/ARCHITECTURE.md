# TubeRack Architecture (Phase 1)

Greenfield repo. Phase 1 establishes contracts and quality gates only.
Backend persistence, auth, providers, workers, and rendering land in Phase 11.

## Stack

- Next.js 16 App Router (`app/`), React 19, TypeScript strict, Tailwind v4
- `zod` for server env + input validation
- `tsx --test` for unit tests (Node 20+)
- No database, no auth, no queue in Phase 1 — by design

## Structure

- `app/` — routes only: `layout`, `page`, `loading`, `error`, `not-found`,
  `global-error`, `api/health`, `api/version`
- `src/types/domain.ts` — lifecycle stages, job statuses, usage kinds,
  AI capabilities, credit + project contracts
- `src/lib/env.ts` — server-only env validation (never `NEXT_PUBLIC_*` secrets)
- `src/lib/ai-gateway/` — provider-independent registry; unconfigured
  capability throws `ProviderNotConfiguredError`, never a fake response
- `src/lib/jobs/machine.ts` — pure recoverable job state machine
- `src/lib/credits/ledger.ts` — central usage/credit math (pure)
- `src/lib/project/lifecycle.ts` — ordered 15-stage pipeline helpers
- `src/components/ui/` — minimal primitives (Container, Card, StatusBadge)
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

## Self-host target (Phase 11)

API + Postgres + Redis/queue + render/FFmpeg workers + object storage +
monitoring/logging/scheduled jobs. External services only where they add
substantial value (models, TTS, email, payments). See `docker-compose.yml`
and `docs/INTEGRATION_BOUNDARIES.md`.
