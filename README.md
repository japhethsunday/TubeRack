# TubeRack

AI-native video production & YouTube intelligence platform:
idea → research → strategy → script → storyboard → visuals → voice →
music → video → thumbnail → SEO → repurposing → publishing →
analytics → improvement.

## Status: Phase 5 — AI Content Intelligence

Deterministic local analysis (idea, audience, strategy, titles, hooks,
retention, gaps) with disclosed methodology — provider reasoning arrives
in Phase 11. See `docs/PHASE_5.md` and `docs/INTEGRATION_BOUNDARIES.md`.

## Develop

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # 80 tests: intelligence, domain, projects, auth, components
npm run typecheck
npm run lint
npm run build
```

## Routes (real)

- `/` — foundation status, no fake product UI
- `/dashboard` — continue, recent, real activity (device-local)
- `/projects` — search/filter/sort, grid/list, archive, JSON import/export
- `/projects/[id]` — pipeline, modules, intelligence, summary, manage
- `/projects/preview` — 11 stage tabs, progress, editor layout (static preview data)
- `/intelligence` — hub: tasks, opportunities, Channel DNA
- `/intelligence/lab|audience|strategy|titles|hooks|retention|gaps` — analysis studios
- `/activity` — filterable event feed
- `/design` — component/token/pattern gallery
- `/login`, `/signup`, `/forgot-password`, `/reset-password`,
  `/verify-email`, `/onboarding` — auth UX, validated locally, Phase 11 boundary
- `/settings` — profile, preferences, notifications, security, sessions,
  workspace, billing, data (preview-only)
- `/api/health` — liveness probe
- `/api/version` — static build metadata

Copy `.env.example` to `.env.local` for local config. Provider keys are
server-only and intentionally empty in Phase 1.
