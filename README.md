# TubeRack

AI-native video production & YouTube intelligence platform:
idea → research → strategy → script → storyboard → visuals → voice →
music → video → thumbnail → SEO → repurposing → publishing →
analytics → improvement.

## Status: Phase 2 — Brand, Design System & UX

Reusable visual + UX foundation on top of Phase 1 contracts. See
`docs/PHASE_2.md` for the completion record and
`docs/INTEGRATION_BOUNDARIES.md` for what is explicitly deferred
(no backend, auth, providers, rendering, or billing yet).

## Develop

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # 30 tests: domain + tokens + navigation + components
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
- `/api/health` — liveness probe
- `/api/version` — static build metadata

Copy `.env.example` to `.env.local` for local config. Provider keys are
server-only and intentionally empty in Phase 1.
