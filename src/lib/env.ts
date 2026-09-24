import { z } from "zod";

/**
 * Server-only environment validation.
 * Only NEXT_PUBLIC_APP_URL may reach the browser — enforced by name below.
 * Import only from server code (route handlers / server components / workers).
 */

const serverSchema = z.object({
  APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

  // Supabase backend (all server-only; user supplies real values per environment)
  // DATABASE_URL: Supabase pooler connection string (Project → Connect).
  DATABASE_URL: z.string().optional(),
  SUPABASE_URL: z.string().url().optional(),
  // service_role key: bypasses RLS, server-only, never NEXT_PUBLIC_.
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_BUCKET: z.string().default("media"),

  // Transactional email (Resend; server-only)
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("TubeRack <no-reply@info.lekderis.com>"),

  // Security (required for auth routes; validated lazily at startup of those routes)
  JWT_SECRET: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),

  // Backend options
  MEDIA_INLINE_LIMIT: z.coerce.number().int().positive().default(5242880),
  API_ALLOWED_ORIGINS: z.string().optional(),

  // Deferred integrations (later phases; server-only)
  TEXT_PROVIDER: z.string().optional(),
  TEXT_API_KEY: z.string().optional(),
  IMAGE_PROVIDER: z.string().optional(),
  IMAGE_API_KEY: z.string().optional(),
  VIDEO_PROVIDER: z.string().optional(),
  VIDEO_API_KEY: z.string().optional(),
  TTS_PROVIDER: z.string().optional(),
  TTS_API_KEY: z.string().optional(),
  MUSIC_PROVIDER: z.string().optional(),
  MUSIC_API_KEY: z.string().optional(),
  EMBEDDING_PROVIDER: z.string().optional(),
  EMBEDDING_API_KEY: z.string().optional(),
  RESEARCH_PROVIDER: z.string().optional(),
  RESEARCH_API_KEY: z.string().optional(),
  YOUTUBE_API_KEY: z.string().optional(),
  YOUTUBE_FALLBACK_BASE: z.string().optional(),
  // Sent as Referer so keys restricted to "HTTP referrers (websites)" accept
  // server calls. Must match an allowed referrer on the key. Defaults to APP_URL.
  YOUTUBE_API_REFERER: z.string().optional(),

  // Google OAuth for "Connect YouTube" (YouTube Data + Analytics on the user's channel)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // Shared secret Vercel Cron sends as "Authorization: Bearer <CRON_SECRET>"
  CRON_SECRET: z.string().optional(),

  // Google Gemini (server-only primary AI provider: text, intelligence, image, TTS)
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_TEXT_MODEL: z.string().optional(),
  GEMINI_IMAGE_MODEL: z.string().optional(),
  GEMINI_TTS_MODEL: z.string().optional(),
  GEMINI_TTS_VOICE: z.string().optional(),

  // NVIDIA hosted models (build.nvidia.com): extra text models used when Gemini is busy or unavailable
  NVIDIA_API_KEY: z.string().optional(),
  // Optional comma-separated override of the NVIDIA model order
  NVIDIA_TEXT_MODELS: z.string().optional(),

  // Mistral (console.mistral.ai): text models, Voxtral voice and transcription as backups to Gemini
  MISTRAL_API_KEY: z.string().optional(),
  // Optional overrides
  MISTRAL_TEXT_MODELS: z.string().optional(),
  MISTRAL_TTS_VOICE: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

/**
 * Accepted aliases (Supabase-standard names). Only non-secret values may
 * come from NEXT_PUBLIC_*: the project URL is public by design; the DB URL
 * and service-role key are read from server-only names exclusively.
 */
function withAliases(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const blank = (v: string | undefined) => !(v ?? "").trim();
  return {
    ...env,
    DATABASE_URL: blank(env.DATABASE_URL) ? env.SUPABASE_DB_URL : env.DATABASE_URL,
    SUPABASE_URL: blank(env.SUPABASE_URL) ? env.NEXT_PUBLIC_SUPABASE_URL : env.SUPABASE_URL,
  };
}

/** Validate process.env once; throws with a clear message on misconfiguration. */
export function getServerEnv(env: NodeJS.ProcessEnv = process.env): ServerEnv {
  if (cached && env === process.env) return cached;
  const parsed = serverSchema.safeParse(withAliases(env));
  if (!parsed.success) {
    throw new Error(
      `Invalid server environment: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  if (env === process.env) cached = parsed.data;
  return parsed.data;
}

/** Backend availability without leaking values. */
export function backendStatus(env: ServerEnv): {
  database: boolean;
  storage: boolean;
  auth: boolean;
  email: boolean;
} {
  return {
    database: Boolean(env.DATABASE_URL),
    storage: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
    auth: Boolean(env.DATABASE_URL && env.JWT_SECRET),
    email: Boolean(env.RESEND_API_KEY),
  };
}

/** Guard: refuse to expose any server secret key name to the browser. */
export function assertServerOnly(key: string): void {
  if (key.startsWith("NEXT_PUBLIC_") && key !== "NEXT_PUBLIC_APP_URL") {
    throw new Error(
      `Refusing to expose "${key}" to the browser. Provider credentials must be server-only.`,
    );
  }
}

/** For tests: reset the memoized env. */
export function __resetEnvCache(): void {
  cached = null;
}
