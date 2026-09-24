# AI provider architecture

TubeRack uses hosted APIs only. No GPU servers, sidecars, or workers.

```
UI (studios) → /api/v1/ai/* route (sign-in, per-user rate limit, usage record)
             → adapter in src/server/ai/gemini.ts or src/server/youtube/client.ts
             → Gemini API / YouTube Data API
Email        → src/server/email.ts → Resend
```

| Capability | Provider | Route | Env |
|---|---|---|---|
| Intelligence analysis | Gemini | `/api/v1/ai/intelligence` | GEMINI_API_KEY |
| Script drafts, section rewrite | Gemini | `/api/v1/ai/script`, `/api/v1/ai/rewrite` | GEMINI_API_KEY |
| Titles, SEO | Gemini | `/api/v1/ai/package` | GEMINI_API_KEY |
| Images | Gemini | `/api/v1/ai/image` | GEMINI_API_KEY |
| Narration (TTS) | Gemini | `/api/v1/ai/speech` | GEMINI_API_KEY |
| Captions from voice | Gemini (audio understanding) | `/api/v1/ai/transcribe` | GEMINI_API_KEY |
| Research, live stats | YouTube Data API (oEmbed fallback) | `/api/v1/youtube/*` | YOUTUBE_API_KEY |
| Email | Resend | auth routes | RESEND_API_KEY, EMAIL_FROM |

Rules: unconfigured → `ProviderNotConfiguredError` → HTTP 503 with a
precise message; never fake output. Contracts in
`src/lib/ai-gateway/types.ts` stay provider-neutral so another API
(e.g. a different TTS or image vendor) can be added behind the same route
without UI changes. `GET /api/v1/system/providers` lists presence only.
