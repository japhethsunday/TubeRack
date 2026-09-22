# Decisions (Phases 1–8)

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
9. Phase 2: one icon set (`lucide-react`), semantic tokens consumed via
   Tailwind utilities, single nav config with live/preview/planned states.
   Preview fixtures live in `src/config/preview.ts` and must be labeled
   "Preview" wherever rendered. Component tests server-render
   (`react-dom/server`) — no browser harness until E2E is warranted.
10. Phase 3: valid auth input ends in a boundary notice, never fake success;
    forgot-password copy is account-agnostic; returnTo accepts same-origin
    paths only; logout discloses the missing session instead of performing
    one; preferences stay local and say so (theme excepted — it is real).
11. Phase 4: project/channel/activity state is device-local (localStorage,
    zod-validated, UI-disclosed) so management is genuinely functional
    without faking a backend; progress/continue/recency derive from real
    state; activity logs user actions only; import/export is real JSON.
12. Phase 5: intelligence without providers means deterministic local
    analysis with disclosed methodology and qualitative ratings — never
    scores, metrics, or generated claims. TaskRunner reuses one lifecycle
    for local runs today and provider jobs in Phase 11.
13. Phase 6: scripts are structured sections with local assembly flagged as
    starter text; section rewrites show their would-be request behind the
    provider boundary; versions snapshot before restores/applies; notes live
    outside narration by construction; scenes sync-hash their sections.
14. Phase 7: media without providers means on-device synthesis (SVG drafts,
    system TTS, WebAudio beds) labeled as drafts + validated session uploads
    + saved provider requests; approvals never auto-replace; playback is
    exclusive; capabilities gate controls with reasons.
15. Phase 8: the timeline references assets by ID and renders a live DOM
    preview (never a fake render); history tracks structural edits while
    typing autosaves; export health is ready/review/blocked with fixes;
    render requests save parameters only — no percentages, no fake jobs.
