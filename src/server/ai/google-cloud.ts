import { GoogleAuth } from "google-auth-library";
import { getServerEnv } from "@/src/lib/env";

/**
 * Google Cloud for production: Vertex AI (Gemini on Cloud billing, higher
 * limits) and Cloud Text-to-Speech (studio voices, its own quota). Both use
 * a service-account key; Cloud TTS can also use a plain API key.
 */

type Env = ReturnType<typeof getServerEnv>;

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

/** The service-account key from the environment (raw JSON or base64 JSON), or null. */
export function serviceAccount(env: Env = getServerEnv()): ServiceAccount | null {
  const raw = env.GOOGLE_SERVICE_ACCOUNT_KEY?.trim();
  if (!raw) return null;
  try {
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const key = JSON.parse(json) as ServiceAccount;
    if (!key.client_email || !key.private_key) return null;
    // Keys pasted through dashboards often carry literal "\n".
    return { ...key, private_key: key.private_key.replace(/\\n/g, "\n") };
  } catch {
    return null;
  }
}

export function vertexProject(env: Env = getServerEnv()): string | null {
  return env.GOOGLE_CLOUD_PROJECT?.trim() || serviceAccount(env)?.project_id || null;
}

/** Vertex AI is used for Gemini when a service account and a project are configured. */
export function isVertexConfigured(env: Env = getServerEnv()): boolean {
  return Boolean(serviceAccount(env) && vertexProject(env));
}

export function vertexOptions(env: Env = getServerEnv()) {
  const key = serviceAccount(env);
  if (!key) throw new Error("Vertex AI is not configured.");
  return {
    vertexai: true as const,
    project: vertexProject(env) ?? undefined,
    // "global" serves the newest Gemini models; set a region to pin data residency.
    location: env.GOOGLE_CLOUD_LOCATION?.trim() || "global",
    googleAuthOptions: {
      credentials: { client_email: key.client_email, private_key: key.private_key },
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    },
  };
}

export function isCloudTtsConfigured(env: Env = getServerEnv()): boolean {
  return Boolean(env.GOOGLE_TTS_API_KEY?.trim() || serviceAccount(env));
}

let auth: GoogleAuth | null = null;
async function bearer(env: Env): Promise<string> {
  const key = serviceAccount(env);
  if (!key) throw new Error("Cloud Text-to-Speech is not configured.");
  auth ??= new GoogleAuth({ credentials: { client_email: key.client_email, private_key: key.private_key }, scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const token = await auth.getAccessToken();
  if (!token) throw new Error("Couldn't sign in to Google Cloud.");
  return token;
}

/** Default: a natural, clear narration voice. Any Cloud TTS voice name works. */
export const DEFAULT_CLOUD_VOICE = "en-US-Chirp3-HD-Charon";
/** Cloud TTS takes up to 5,000 bytes per request; keep pieces well under. */
export const CLOUD_TTS_CHUNK_CHARS = 3500;

/** One Cloud TTS request → 16-bit mono PCM at 24 kHz. */
export async function cloudTtsChunk(text: string, voiceName?: string): Promise<{ pcm: Buffer; rate: number }> {
  const env = getServerEnv();
  const voice = voiceName?.trim() || env.GOOGLE_TTS_VOICE?.trim() || DEFAULT_CLOUD_VOICE;
  const languageCode = voice.split("-").slice(0, 2).join("-") || "en-US";
  const apiKey = env.GOOGLE_TTS_API_KEY?.trim();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!apiKey) headers.Authorization = `Bearer ${await bearer(env)}`;
  const project = vertexProject(env);
  if (!apiKey && project) headers["x-goog-user-project"] = project;
  const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize${apiKey ? `?key=${encodeURIComponent(apiKey)}` : ""}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      input: { text },
      voice: { languageCode, name: voice },
      audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: 24000 },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Cloud TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { audioContent?: string };
  if (!body.audioContent) throw new Error("Cloud TTS returned no audio.");
  return wavToPcm(Buffer.from(body.audioContent, "base64"));
}

/** LINEAR16 replies are WAV files: take the samples and the rate from the header. */
export function wavToPcm(wav: Buffer): { pcm: Buffer; rate: number } {
  if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF") return { pcm: wav, rate: 24000 };
  let off = 12;
  let rate = 24000;
  while (off + 8 <= wav.length) {
    const id = wav.toString("ascii", off, off + 4);
    const size = wav.readUInt32LE(off + 4);
    if (id === "fmt ") rate = wav.readUInt32LE(off + 12);
    if (id === "data") return { pcm: wav.subarray(off + 8, Math.min(wav.length, off + 8 + size)), rate };
    off += 8 + size + (size % 2);
  }
  return { pcm: wav.subarray(44), rate };
}
