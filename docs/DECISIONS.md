# Decisions (Phase 1)

1. Greenfield Next.js App Router, not a clone of any benchmark. TubeGen is a
   capability benchmark only.
2. TypeScript strict + `zod` validation at trust boundaries.
3. Tailwind v4 via `@tailwindcss/postcss`; no custom design tokens yet (Phase 2).
4. Pure domain modules (`jobs`, `credits`, `lifecycle`) with no I/O so they
   are unit-testable and reusable by API routes, workers, and UI alike.
5. Gateway exposes capability interfaces, not vendor clients. Provider SDKs
   are a Phase 11 concern and stay server-side.
6. Tests run with `tsx --test` on Node 20+ — zero browser/harness overhead
   for pure logic; Playwright/E2E arrives when product UI exists.
7. Self-host-first: Postgres + Redis + object storage + FFmpeg workers as the
   Phase 11 target; paid services only for models/media/TTS/email/payments.
8. Honest states: anything needing Phase 11 throws or is labeled
   "Awaiting integration" — never mocked as working.
