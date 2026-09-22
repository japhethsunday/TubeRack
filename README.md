# TubeRack

AI-native video production & YouTube intelligence platform:
idea → research → strategy → script → storyboard → visuals → voice →
music → video → thumbnail → SEO → repurposing → publishing →
analytics → improvement.

## Status: Phase 9 — Thumbnail, SEO & Repurposing

Packaging studio: thumbnail concepts/variants with real SVG/PNG export,
title pairing, SEO workspace with real timestamps and counts, platform
packs, and deterministic repurposing with consistency flags. Publishing
and analytics arrive later.
See `docs/PHASE_9.md` and `docs/INTEGRATION_BOUNDARIES.md`.

## Develop

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # 116 tests: packaging, video, media, script, intelligence, projects, auth
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
- `/studio/video` — timeline composition, live preview, export validation
- `/studio/package` — thumbnail, titles, SEO, platforms, repurposing
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
