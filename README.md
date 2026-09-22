# TubeRack

AI-native video production & YouTube intelligence platform:
idea → research → strategy → script → storyboard → visuals → voice →
music → video → thumbnail → SEO → repurposing → publishing →
analytics → improvement.

## Status: Phase 1 — Product Foundation & Architecture

Foundation contracts and quality gates only. See `docs/PHASE_1.md` for the
honest completion record and `docs/INTEGRATION_BOUNDARIES.md` for what is
explicitly awaiting Phase 11 (providers, DB, workers, YouTube, billing).

## Develop

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # unit tests (env, gateway, jobs, credits, lifecycle)
npm run typecheck
npm run lint
npm run build
```

## Routes (real)

- `/` — foundation status, no fake product UI
- `/api/health` — liveness probe
- `/api/version` — static build metadata

Copy `.env.example` to `.env.local` for local config. Provider keys are
server-only and intentionally empty in Phase 1.
