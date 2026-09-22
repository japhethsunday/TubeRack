import { z } from "zod";

/**
 * Server-only environment validation.
 * Provider credentials must NEVER carry a NEXT_PUBLIC_ prefix.
 * Import only from server code (route handlers / server components / workers).
 */

const serverSchema = z.object({
  APP_URL: z.string().url().default("http://localhost:3000"),
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
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_BUCKET: z.string().optional(),
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

/** Guard: refuse to expose any server secret key name to the browser. */
export function assertServerOnly(key: string): void {
  if (key.startsWith("NEXT_PUBLIC_")) {
    throw new Error(
      `Refusing to expose "${key}" to the browser. Provider credentials must be server-only.`,
    );
  }
}

/** For tests: reset the memoized env. */
export function __resetEnvCache(): void {
  cached = null;
}
