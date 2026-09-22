# Phase 6 — Script & Story Studio: completion record

## Implemented

- Script domain (`lib/script/`): 14-format registry with section templates,
  script/section/version/scene/loop/claim/ref types, word/char/runtime math,
  deterministic local assembly from intelligence (flagged starter text),
  section ops (add/split/merge/duplicate/delete/reorder), extractive
  shorten, versions with pre-restore backups + diffs, claim detection (all
  unverified), research refs, retention bridge, open-loop tracker, scene
  mapping with sync hashes
- Section review: empties, weak hooks, overload, density, unverified claims,
  repetition, abrupt entries — specific and dismissible
- `ScriptProvider`: device-local scripts/boards/loops (`tuberack.scripts.v1`,
  zod-validated), save-status, JSON export/import
- `/studio/script`: project picker, blank/assembled start, context/editor/
  tools 3-panel (tabbed on mobile), undo/redo, in-script search, WPM control,
  generation dialog (options → preview → apply-as-version), section tools
  with preview-first shorten/rewrite-boundary, hook builder with confirmed
  replacement, retention + loops + versions panels, per-section claims/refs/
  private notes (notes excluded from counts by construction)
- `/studio/storyboard`: scenes from sections, editable production fields,
  reorder, duration timeline, sync badges + re-sync, blank scenes, guarded
  rebuild, export/import
- Provider rewrites (rewrite/tone/expand) show the exact assembled request
  behind a Phase 11 boundary — never fake output
- Nav: Script Studio + Storyboard live; studios in command index; dashboard
  quick action + project overview continue route into the studios

## Reused

- Phase 5 intelligence (approved hooks/titles, strategy, audience, DNA,
  retention/hook analyzers, context assembler), Phase 4 store + Update path
  for apply-to-project, Phase 2 shell/components/patterns/states

## Fixed

- `require()` in provider → static imports (browser bundle)
- Closure-narrowing quirk via captured ids (same as Phase 4)
- Lint: unescaped entity, render-purity via lib `blankScene`, justified
  effect disables matching the established hydration pattern
- Tests caught: INTEL/STUDIO page split, multi-kind claims, deep-equal arrays

## Tested

- `npm run lint` / `typecheck` — clean
- `npm test` — 91/91 pass, 33 suites (new: formats, measure, claims, engine,
  review, storage)
- `npm run build` — clean, 27 routes
- Production probe — 12/12 routes 200, no error digests (`?searchParams`
  studios serve honest loading shells, hydrate client-side)
- Keyboard/ARIA: toolbar labels, dialogs, tabs, progress roles, labelled fields

## Deferred

- Provider generation, voice/captions/timing consumers, board versions,
  research engine + verification, video editor (Phase 8), backend (Phase 11)

## Backend Dependencies (Phase 11)

- Text provider for section ops; claim verification pipeline; script/board
  cloud sync + autosave + conflicts; export/render consumers of scenes

## Next Phase

**Phase 7 — Visual & Audio Studio** (not started)
