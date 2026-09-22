# TubeRack

AI-native video production & YouTube intelligence platform:
idea → research → strategy → script → storyboard → visuals → voice →
music → video → thumbnail → SEO → repurposing → publishing →
analytics → improvement.

## Status: Phase 4 — Creator Workspace

Real project/channel/activity management on device-local storage
(disclosed in UI; cloud sync arrives in Phase 11). See `docs/PHASE_4.md`
and `docs/INTEGRATION_BOUNDARIES.md`.

## Develop

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # 62 tests: domain, projects, auth, tokens, components
npm run typecheck
npm run lint
npm run build
```

## Routes (real)

- `/` — foundation status, no fake product UI
- `/dashboard` — overview with honest empty states
- `/projects` — index + link to the preview workspace
- `/projects/preview` — 11 stage tabs, progress, editor layout (static preview data)
- `/design` — component/token/pattern gallery
- `/dashboard` — continue, recent, real activity (device-local)
- `/projects` — search/filter/sort, grid/list, archive, JSON import/export
- `/projects/[id]` — pipeline, modules, summary, manage
- `/activity` — filterable event feed
- `/login`, `/signup`, `/forgot-password`, `/reset-password`,
  `/verify-email`, `/onboarding` — auth UX, validated locally, Phase 11 boundary
- `/settings` — profile, preferences, notifications, security, sessions,
  workspace, billing, data (preview-only)
- `/api/health` — liveness probe
- `/api/version` — static build metadata

Copy `.env.example` to `.env.local` for local config. Provider keys are
server-only and intentionally empty in Phase 1.
