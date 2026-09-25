import { getServerEnv } from "@/src/lib/env";

/**
 * NVIDIA-hosted image models (build.nvidia.com), used when Gemini can't make
 * images (no quota, busy, or not configured). Each family takes slightly
 * different settings; replies carry the image as base64.
 */
type Aspect = "16:9" | "9:16" | "1:1";
type Family = "flux" | "sd3" | "sdxl";

// Tested live on this account: FLUX.1-dev answers (~10 s). FLUX.1-schnell
// hung, and the Stable Diffusion models aren't enabled for the account.
export const NVIDIA_IMAGE_MODELS: { id: string; family: Family; steps: number }[] = [
  { id: "black-forest-labs/flux.1-dev", family: "flux", steps: 30 },
];

const SIZES: Record<Aspect, { width: number; height: number }> = {
  "16:9": { width: 1344, height: 768 },
  "9:16": { width: 768, height: 1344 },
  "1:1": { width: 1024, height: 1024 },
};

export function isNvidiaImageConfigured(env = getServerEnv()): boolean {
  return Boolean(env.NVIDIA_API_KEY);
}

/** Request bodies to try, most specific first; a plain prompt is the last resort. */
function bodies(family: Family, prompt: string, aspect: Aspect, steps: number): Record<string, unknown>[] {
  const seed = Math.floor(Math.random() * 2_000_000_000);
  const size = SIZES[aspect];
  if (family === "flux") return [{ prompt, mode: "base", ...size, seed, steps, cfg_scale: 3.5 }, { prompt, ...size, seed, steps }, { prompt }];
  if (family === "sd3") return [{ prompt, aspect_ratio: aspect, seed, steps, cfg_scale: 5, negative_prompt: "text, watermark, blurry" }, { prompt, aspect_ratio: aspect }, { prompt }];
  return [{ text_prompts: [{ text: prompt, weight: 1 }], ...(aspect === "1:1" ? { width: 1024, height: 1024 } : aspect === "16:9" ? { width: 1344, height: 768 } : { width: 768, height: 1344 }), seed, steps, cfg_scale: 5, sampler: "K_DPM_2_ANCESTRAL" }, { prompt }];
}

function mimeOf(bytes: Buffer): string {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes.toString("ascii", 1, 4) === "PNG") return "image/png";
  if (bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return "image/png";
}

/** Pull the base64 image out of any of the reply shapes NVIDIA's image APIs use. */
export function extractImage(body: unknown): string | null {
  const b = (body ?? {}) as { artifacts?: { base64?: string; finishReason?: string }[]; image?: string; data?: { b64_json?: string }[] };
  const art = b.artifacts?.find((a) => a.base64);
  if (art?.finishReason && /CONTENT_FILTERED|ERROR/i.test(art.finishReason)) return null;
  const raw = art?.base64 ?? b.image ?? b.data?.[0]?.b64_json ?? null;
  return raw ? raw.replace(/^data:[^,]+,/, "") : null;
}

const unavailable = new Map<string, number>();

export async function nvidiaImageWith(
  model: { id: string; family: Family; steps: number },
  prompt: string,
  aspect: Aspect,
  key: string,
): Promise<{ dataUrl: string; model: string }> {
  let last = "";
  for (const body of bodies(model.family, prompt, aspect, model.steps)) {
    const res = await fetch(`https://ai.api.nvidia.com/v1/genai/${model.id}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
    if (res.ok) {
      const b64 = extractImage(await res.json().catch(() => null));
      if (!b64) throw new Error(`NVIDIA ${model.id}: no image in reply (possibly filtered)`);
      const bytes = Buffer.from(b64, "base64");
      if (bytes.length < 1000) throw new Error(`NVIDIA ${model.id}: image too small`);
      return { dataUrl: `data:${mimeOf(bytes)};base64,${b64}`, model: model.id };
    }
    last = `NVIDIA ${model.id} ${res.status}: ${(await res.text()).slice(0, 200)}`;
    // Wrong settings for this model: try the next body shape. Anything else: give up on this model.
    if (res.status !== 400 && res.status !== 422) {
      if (res.status === 404 || res.status === 403) unavailable.set(model.id, Date.now() + 3_600_000);
      break;
    }
  }
  throw new Error(last || `NVIDIA ${model.id} failed`);
}

/**
 * Turn whatever the user pasted (often markdown concept notes) into a plain
 * image prompt: no headings, bullets, bold markers or field labels, capped in
 * length. Long, noisy prompts are what trip the image models' filters.
 */
export function cleanImagePrompt(raw: string, max = 900): string {
  const text = raw
    .replace(/[#*_`>]+/g, " ")
    .replace(/^\s*[-•]\s*/gm, "")
    .replace(/\b(Concept \d+|Focal Subject|Facial Emotion or Object|Text Overlay|Colou?r Palette|Composition|Background)\s*:/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = cut.lastIndexOf(".");
  return (end > max * 0.5 ? cut.slice(0, end + 1) : cut).trim();
}

/** Try each NVIDIA image model in order until one returns an image. */
export async function nvidiaGenerateImage(prompt: string, aspect: Aspect): Promise<{ dataUrl: string; model: string }> {
  const key = getServerEnv().NVIDIA_API_KEY;
  if (!key) throw new Error("NVIDIA images are not configured.");
  let lastError: unknown = new Error("No NVIDIA image model answered.");
  for (const model of NVIDIA_IMAGE_MODELS) {
    if ((unavailable.get(model.id) ?? 0) > Date.now()) continue;
    // A filtered reply is often a one-off for that seed: try again with a new
    // seed, then with just the first sentences of the prompt.
    const clean = cleanImagePrompt(prompt);
    const attempts = [clean, clean, cleanImagePrompt(clean, 300)];
    for (const p of attempts) {
      try {
        return await nvidiaImageWith(model, p, aspect, key);
      } catch (error) {
        lastError = error;
        if (!/filtered|too small/i.test(error instanceof Error ? error.message : "")) break;
      }
    }
  }
  throw lastError;
}
