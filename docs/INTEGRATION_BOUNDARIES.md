# Integration boundaries (Phases 1–3)

Anything listed here MUST throw a `*NotIntegratedError` / `*NotConfiguredError`
or render an "Awaiting integration" state. Faking success is a defect.

| Capability | Status | Real integration phase |
| --- | --- | --- |
| Text / image / video / TTS / music / embedding / research providers | Registry + types only, no keys, no calls | Phase 11 |
| Intelligence reasoning | Deterministic local heuristics labeled “Local analysis”; `requestIntelligence` throws | Phase 11 |
| Script section generation (rewrite/tone/expand) | Assembled request shown; execution throws/waits | Phase 11 |
| Script/board cloud sync + autosave | Device-local (`tuberack.scripts.v1`) with UI disclosure | Phase 11 |
| Claim verification | Detection only; everything `verified: false` | Phase 11 |
| YouTube data (official API, quota-aware cache) | Interface only, no requests | Phase 5 + 11 |
| Auth sessions / enforcement / password storage / tokens | Frontend UX only; `SESSION_ENFORCEMENT.enforced = false`, no middleware | Phase 11 |
| Email delivery (verification, reset) | Copy + states built; nothing is sent | Phase 11 |
| Database / workspaces / memberships | Device-local browser storage with UI disclosure; no sync or sharing | Phase 4 (local) + 11 (cloud) |
| Queues / workers / FFmpeg render / storage | State machine + ledger math only | Phase 8 + 11 |
| Credits / billing / subscriptions | Pure ledger helper, no persistence; settings show no balances | Phase 10 + 11 |
| Analytics ingestion / feedback loop | None, no synthetic data | Phase 10 + 11 |
| Payments / CDN | None | Phase 11 |

Keys live in server env only (`src/lib/env.ts`). No `NEXT_PUBLIC_*` secret
is ever read or rendered.
