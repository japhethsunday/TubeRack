import { getServerEnv } from "@/src/lib/env";
import { wavToPcm } from "@/src/server/ai/google-cloud";

/**
 * Self-hosted Piper voice server (services/piper-hf, run free on Hugging Face
 * Spaces): the last voice backup — no quota, always available. A sleeping
 * Space takes ~30 s to wake, so the first request waits longer.
 */

export const PIPER_CHUNK_CHARS = 2000;

export function isPiperConfigured(env = getServerEnv()): boolean {
  return Boolean(env.PIPER_URL && env.PIPER_TOKEN);
}

export async function piperChunk(text: string): Promise<{ pcm: Buffer; rate: number }> {
  const env = getServerEnv();
  if (!env.PIPER_URL || !env.PIPER_TOKEN) throw new Error("Piper voice server is not configured.");
  const res = await fetch(`${env.PIPER_URL.replace(/\/+$/, "")}/synthesize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.PIPER_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text, ...(env.PIPER_VOICE ? { voice: env.PIPER_VOICE } : {}) }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Piper ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const wav = Buffer.from(await res.arrayBuffer());
  if (wav.length < 1000) throw new Error("Piper returned no audio.");
  return wavToPcm(wav);
}
