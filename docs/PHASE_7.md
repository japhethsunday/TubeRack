# Phase 7 — Visual & Audio Studio: completion record

## Implemented

- Media domain (`lib/media/`): asset/voice/consistency/job types; provider
  capability matrix (on-device vs Phase-11-gated); seeded SVG draft engine
  (6 styles × 3 aspects, escaped titles, reproducible seeds); visual-prompt
  assembler from scene + DNA; WebAudio music (9 moods) + SFX (8 types)
  recipes with browser renderers; magic-byte upload validation with caps
- `MediaProvider`: device-local assets/voices/consistency
  (`tuberack.media.v1`, zod-validated); session-only blob map (uploads
  honestly expire); approval lifecycle (draft → reviewed → approved → used,
  never auto-replaced); scene assignment; voice profiles with project
  defaults + provider-voice mapping slots; local job runner through the
  generation states
- `/studio/media` (9 tabs, `?tab=` deep links): library (search/filters,
  approval bar, scene assignment, side-by-side compare), scene needs
  (missing-asset detection with jump-to-generator), image drafts
  (variations, prompt assistant, seeds), video request builder (saved
  parameter drafts, no faked clips), voice (system TTS, profiles, takes),
  music + SFX (synth previews, save, assign), uploads (drag/drop, progress,
  cancel, retry, real metadata), style (consistency + DNA prefill), queue
  (active/failed with same-parameter retry/recent)
- Exclusive playback across speech, synth, and file previews; capability
  notices instead of dead controls; cost honesty (drafts free, providers
  metered in Phase 11, no numbers invented)
- Nav: Assets/Voice/Music live with query-aware sidebar highlighting;
  studios in command index; overview links Media Studio

## Reused

- Phase 1 job-state thinking, Phase 2 shell/components/preview patterns,
  Phase 5 TaskRunner lifecycle shape + DNA/context, Phase 6 scenes/sections
  as voice sources and sync targets, Phase 4 projects/channels

## Fixed

- `require()` → static imports; render-purity via lib helpers; justified
  effect disables matching the hydration pattern; query-aware sidebar with
  Suspense-safe static fallback; `as typeof` narrowing traps → named types;
  pitch string→number; bottom-import blocks eliminated

## Tested

- `npm run lint` / `typecheck` — clean
- `npm test` — 98/98 pass, 40 suites (new: svg, validation, prompts,
  capabilities, audio, storage, job runner)
- `npm run build` — clean, 28 routes
- Production probe — 11/11 routes 200, no error digests (studios serve
  honest loading shells, hydrate client-side)
- Keyboard/ARIA: media controls labeled, dialogs, progress roles, tabs

## Deferred

- Provider image/video/TTS/music (requests saved with full params),
  reference-image pipelines, timeline mix, waveform editing, cloud storage,
  final rendering (Phase 8), backend (Phase 11)

## Backend Dependencies (Phase 11)

- Vendor media providers behind the capability matrix; object storage +
  server validation; usage metering per declared kind; voice-model mapping;
  queue/worker execution of saved requests

## Next Phase

**Phase 8 — Video Production Studio** (not started)
