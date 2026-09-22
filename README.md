# TubeRack

AI-native video production & YouTube intelligence platform:
idea → research → strategy → script → storyboard → visuals → voice →
music → video → thumbnail → SEO → repurposing → publishing →
analytics → improvement.

## Status: Phase 7 — Visual & Audio Studio

On-device media drafts (SVG visuals, system-voice takes, synthesized
music/SFX), validated session uploads, and saved provider requests —
approval, assignment, and queue included. Providers in Phase 11.
See `docs/PHASE_7.md` and `docs/INTEGRATION_BOUNDARIES.md`.

## Develop

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # 98 tests: media, script, intelligence, projects, auth, components
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
- `/studio/script` — script writing: sections, versions, hooks, loops, retention
- `/studio/storyboard` — scenes from sections, timeline, sync badges
- `/studio/media` — library, scene needs, image/voice/music/SFX drafts, uploads, queue
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
