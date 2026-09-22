import { z } from "zod";

/**
 * Server-only environment validation.
 * Only NEXT_PUBLIC_APP_URL may reach the browser — enforced by name below.
 * Import only from server code (route handlers / server components / workers).
 */

const serverSchema = z.object({
  APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

  // CloudNivo backend (all server-only; user supplies real values per environment)
  CLOUDNIVO_URL: z.string().url().default("https://www.cloudnivo.org"),
  CLOUDNIVO_API_URL: z.string().url().default("https://api.cloudnivo.org"),
  CLOUDNIVO_PROJECT_ID: z.string().optional(),
  CLOUDNIVO_PROJECT_URL: z.string().url().optional(),
  CLOUDNIVO_PUBLIC_KEY: z.string().optional(),
  CLOUDNIVO_SECRET_KEY: z.string().optional(),
  CLOUDNIVO_AGENT_TOKEN: z.string().optional(),
  CLOUDNIVO_DATABASE_URL: z.string().optional(),
  CLOUDNIVO_STORAGE_URL: z.string().url().optional(),
  CLOUDNIVO_BUCKET: z.string().default("business-data"),

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

  // Google Gemini (server-only primary AI provider: text, intelligence, image, TTS)
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_TEXT_MODEL: z.string().default("gemini-3.6-flash"),
  GEMINI_IMAGE_MODEL: z.string().default("gemini-3.1-flash-image"),
  GEMINI_TTS_MODEL: z.string().default("gemini-2.5-flash-preview-tts"),
  GEMINI_TTS_VOICE: z.string().default("Kore"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

/** Validate process.env once; throws with a clear message on misconfiguration. */
export function getServerEnv(env: NodeJS.ProcessEnv = process.env): ServerEnv {
  if (cached && env === process.env) return cached;
  const parsed = serverSchema.safeParse(env);
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
    database: Boolean(env.CLOUDNIVO_DATABASE_URL),
    storage: Boolean(env.CLOUDNIVO_STORAGE_URL && env.CLOUDNIVO_SECRET_KEY),
    auth: Boolean(env.CLOUDNIVO_DATABASE_URL && env.JWT_SECRET),
    email: false, // No email provider yet — requests store tokens, nothing is sent.
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
