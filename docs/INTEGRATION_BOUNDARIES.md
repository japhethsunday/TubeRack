# Integration boundaries (Phase 1)

Anything listed here MUST throw `ProviderNotConfiguredError` or render an
"Awaiting integration" state. Faking success is a defect.

| Capability | Status Phase 1 | Real integration phase |
| --- | --- | --- |
| Text / image / video / TTS / music / embedding / research providers | Registry + types only, no keys, no calls | Phase 11 |
| YouTube data (official API, quota-aware cache) | Interface only, no requests | Phase 5 + 11 |
| Database / auth / workspaces / memberships | None | Phase 3 + 11 |
| Queues / workers / FFmpeg render / storage | State machine + ledger math only | Phase 8 + 11 |
| Credits / billing / subscriptions | Pure ledger helper, no persistence | Phase 10 + 11 |
| Analytics ingestion / feedback loop | None, no synthetic data | Phase 10 + 11 |
| Email / payments / CDN | None | Phase 11 |

Keys live in server env only (`src/lib/env.ts`). No `NEXT_PUBLIC_*` secret
is ever read or rendered.
