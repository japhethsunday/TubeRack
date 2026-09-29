import { z } from "zod";
import type { ConsistencySettings, GenerationJob, MediaAsset, MediaStatus, VoiceProfile } from "@/src/lib/media/types";

const assetSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  sceneIds: z.array(z.string()),
  kind: z.enum(["image", "video", "voice", "music", "sfx"]),
  source: z.enum(["local-draft", "upload-session", "provider-request", "provider-output"]),
  status: z.enum(["pending", "preparing", "generating", "processing", "ready", "failed", "cancelled"]),
  title: z.string(),
  payload: z.string(),
  mime: z.string(),
  durationSec: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  fileSize: z.number().optional(),
  seed: z.number().optional(),
  tags: z.array(z.string()),
  approval: z.enum(["draft", "reviewed", "approved", "used", "rejected"]),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const voiceSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  language: z.string(),
  rate: z.number(),
  pitch: z.number(),
  systemVoice: z.string(),
  providerVoice: z.string(),
  isDefault: z.boolean(),
  createdAt: z.string(),
});

const consistencySchema = z.object({
  projectId: z.string(),
  visualStyle: z.string(),
  colorDirection: z.string(),
  lighting: z.string(),
  cameraLanguage: z.string(),
  characterNotes: z.string(),
  environmentStyle: z.string(),
  avoidStyles: z.string(),
  updatedAt: z.string(),
});

const bundleSchema = z.object({
  version: z.literal(1),
  assets: z.array(assetSchema),
  voices: z.array(voiceSchema),
  consistency: z.array(consistencySchema),
});

export interface MediaBundle {
  version: 1;
  assets: MediaAsset[];
  voices: VoiceProfile[];
  consistency: ConsistencySettings[];
}

export const MEDIA_STORAGE_KEY = "tuberack.media.v1";

export function emptyMediaBundle(): MediaBundle {
  return { version: 1, assets: [], voices: [], consistency: [] };
}

/** Keep every valid item; skip (and report) only the ones that don't fit, never the whole list. */
function keepValid<T>(schema: z.ZodType<T>, items: unknown, label: string): T[] {
  if (!Array.isArray(items)) return [];
  const out: T[] = [];
  for (const item of items) {
    const r = schema.safeParse(item);
    if (r.success) out.push(r.data);
    else console.error(`skipped a ${label} that couldn't be read:`, r.error.issues[0]?.path.join("."), r.error.issues[0]?.message);
  }
  return out;
}

export function parseMediaBundle(data: unknown): MediaBundle {
  const raw = (data ?? {}) as { version?: unknown; assets?: unknown; voices?: unknown; consistency?: unknown };
  if (raw.version === 1 && Array.isArray(raw.assets)) {
    // Coerce numeric fields that may arrive as text, then validate item by item.
    const assets = raw.assets.map((a) => {
      if (!a || typeof a !== "object") return a;
      const o = { ...(a as Record<string, unknown>) };
      for (const k of ["durationSec", "width", "height", "fileSize", "seed"]) {
        if (o[k] === null || o[k] === "") delete o[k];
        else if (typeof o[k] === "string" && Number.isFinite(Number(o[k]))) o[k] = Number(o[k]);
      }
      return o;
    });
    const bundle: MediaBundle = {
      version: 1,
      assets: keepValid(assetSchema, assets, "media item") as MediaAsset[],
      voices: keepValid(voiceSchema, raw.voices, "voice") as VoiceProfile[],
      consistency: keepValid(consistencySchema, raw.consistency, "style setting") as ConsistencySettings[],
    };
    for (const a of bundle.assets) a.title = a.title.replace(/^Gemini take\b/, "Voice take").replace(/^Gemini art\b/, "Art").replace(/\bGemini\b/g, "Generated");
    return bundle;
  }
  const parsed = bundleSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Import is not a Recktube media file: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "root"} — ${i.message}`).join("; ")}`,
    );
  }
  const bundle = parsed.data as MediaBundle;
  // Older takes and images were titled after the model provider.
  for (const a of bundle.assets) a.title = a.title.replace(/^Gemini take\b/, "Voice take").replace(/^Gemini art\b/, "Art").replace(/\bGemini\b/g, "Generated");
  return bundle;
}

export type { GenerationJob, MediaStatus };
