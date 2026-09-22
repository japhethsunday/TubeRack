import { z } from "zod";
import type { ConsistencySettings, GenerationJob, MediaAsset, MediaStatus, VoiceProfile } from "@/src/lib/media/types";

const assetSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  sceneIds: z.array(z.string()),
  kind: z.enum(["image", "video", "voice", "music", "sfx"]),
  source: z.enum(["local-draft", "upload-session", "provider-request"]),
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

export function parseMediaBundle(data: unknown): MediaBundle {
  const parsed = bundleSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Import is not a TubeRack media file: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "root"} — ${i.message}`).join("; ")}`,
    );
  }
  return parsed.data as MediaBundle;
}

export type { GenerationJob, MediaStatus };
