import { z } from "zod";
import type { Composition, CompositionSnapshot, RenderRequest } from "@/src/lib/video/types";

const styleSchema = z.object({
  font: z.string(),
  size: z.number(),
  weight: z.number(),
  align: z.enum(["left", "center", "right"]),
  position: z.enum(["top", "center", "bottom"]),
  color: z.string(),
  background: z.string(),
  opacity: z.number(),
});

const clipSchema = z.object({
  id: z.string(),
  trackId: z.string(),
  sceneId: z.string().optional(),
  kind: z.enum(["video", "image", "voice", "music", "sfx", "text", "captions"]),
  name: z.string(),
  assetId: z.string().optional(),
  text: z.string().optional(),
  startSec: z.number(),
  durationSec: z.number(),
  volume: z.number(),
  fadeInSec: z.number(),
  fadeOutSec: z.number(),
  muted: z.boolean(),
  motion: z.string().optional(),
  transitionIn: z.string().optional(),
  transitionOut: z.string().optional(),
  effectIds: z.array(z.string()).optional(),
  style: styleSchema.optional(),
  inSec: z.number().optional(),
  speed: z.number().optional(),
  reverse: z.boolean().optional(),
  transform: z.object({ x: z.number(), y: z.number(), scale: z.number(), rotation: z.number(), flipH: z.boolean(), flipV: z.boolean() }).optional(),
  crop: z.object({ top: z.number(), right: z.number(), bottom: z.number(), left: z.number() }).optional(),
  filters: z
    .object({ brightness: z.number(), contrast: z.number(), saturation: z.number(), hue: z.number(), blur: z.number(), grayscale: z.number(), sepia: z.number(), vignette: z.number() })
    .optional(),
  opacity: z.number().optional(),
  fit: z.enum(["contain", "cover", "fill"]).optional(),
  textAnim: z.enum(["none", "fade", "slide-up", "pop", "typewriter", "wipe"]).optional(),
});

const trackSchema = z.object({
  id: z.string(),
  kind: z.enum(["video", "image", "voice", "music", "sfx", "text", "captions"]),
  label: z.string(),
  muted: z.boolean(),
  hidden: z.boolean(),
  volume: z.number().optional(),
});

const compositionSchema = z.object({
  projectId: z.string(),
  tracks: z.array(trackSchema),
  clips: z.array(clipSchema),
  canvas: z.object({
    preset: z.string(),
    aspect: z.string(),
    width: z.number(),
    height: z.number(),
    background: z.string().optional(),
  }),
  updatedAt: z.string(),
});

const snapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  at: z.string(),
  data: compositionSchema,
});

const requestSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  preset: z.string(),
  settings: z.record(z.string(), z.string()),
  issues: z.array(z.object({
    severity: z.enum(["block", "warn"]),
    scene: z.string().optional(),
    message: z.string(),
    fix: z.string(),
  })),
  health: z.enum(["ready", "review", "blocked"]),
  status: z.enum(["draft", "saved"]),
  createdAt: z.string(),
});

const bundleSchema = z.object({
  version: z.literal(1),
  compositions: z.array(compositionSchema),
  snapshots: z.array(snapshotSchema),
  requests: z.array(requestSchema),
});

export interface VideoBundle {
  version: 1;
  compositions: Composition[];
  snapshots: CompositionSnapshot[];
  requests: RenderRequest[];
}

export const VIDEO_STORAGE_KEY = "tuberack.video.v1";

export function emptyVideoBundle(): VideoBundle {
  return { version: 1, compositions: [], snapshots: [], requests: [] };
}

export function parseVideoBundle(data: unknown): VideoBundle {
  const parsed = bundleSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Import is not a TubeRack video file: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "root"} — ${i.message}`).join("; ")}`,
    );
  }
  return parsed.data as VideoBundle;
}
