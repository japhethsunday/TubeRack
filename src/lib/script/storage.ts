import { z } from "zod";
import type { LoopItem, Scene, Script } from "@/src/lib/script/types";

const sectionSchema = z.object({
  id: z.string(),
  type: z.string(),
  heading: z.string(),
  text: z.string(),
  aiGenerated: z.boolean(),
  aiNote: z.string().optional(),
  edited: z.boolean(),
  sceneIds: z.array(z.string()),
  retentionNotes: z.array(z.string()),
  researchRefs: z.array(z.object({
    id: z.string(),
    fact: z.string(),
    source: z.string(),
    verified: z.boolean(),
  })),
  creatorNotes: z.string(),
  updatedAt: z.string(),
});

const versionSchema = z.object({
  id: z.string(),
  name: z.string(),
  note: z.string(),
  at: z.string(),
  sections: z.array(sectionSchema),
});

const scriptSchema = z.object({
  projectId: z.string(),
  format: z.string(),
  tone: z.string(),
  complexity: z.string(),
  structure: z.string(),
  targetWords: z.number(),
  wpm: z.number(),
  instruction: z.string(),
  sections: z.array(sectionSchema),
  versions: z.array(versionSchema),
  notes: z.string(),
  updatedAt: z.string(),
});

const sceneSchema = z.object({
  id: z.string(),
  number: z.number(),
  title: z.string(),
  sectionIds: z.array(z.string()),
  scriptText: z.string(),
  durationSec: z.number(),
  visual: z.string(),
  narration: z.string(),
  onScreenText: z.string(),
  transition: z.string(),
  shot: z.string(),
  broll: z.string(),
  assetsNeeded: z.array(z.string()),
  notes: z.string(),
  sourceHash: z.string(),
  updatedAt: z.string(),
});

const loopSchema = z.object({
  id: z.string(),
  kind: z.enum(["loop", "question", "promise", "teaser"]),
  text: z.string(),
  openedInSectionId: z.string(),
  payoffSectionId: z.string().optional(),
});

const bundleSchema = z.object({
  version: z.literal(1),
  scripts: z.record(z.string(), scriptSchema),
  boards: z.record(z.string(), z.object({
    projectId: z.string(),
    scenes: z.array(sceneSchema),
    updatedAt: z.string(),
  })),
  loops: z.record(z.string(), z.array(loopSchema)),
});

export interface ScriptBundle {
  version: 1;
  scripts: Record<string, Script>;
  boards: Record<string, { projectId: string; scenes: Scene[]; updatedAt: string }>;
  loops: Record<string, LoopItem[]>;
}

export const SCRIPTS_STORAGE_KEY = "tuberack.scripts.v1";

export function emptyScriptBundle(): ScriptBundle {
  return { version: 1, scripts: {}, boards: {}, loops: {} };
}

export function parseScriptBundle(data: unknown): ScriptBundle {
  const parsed = bundleSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Import is not a TubeRack script file: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "root"} — ${i.message}`).join("; ")}`,
    );
  }
  return parsed.data as ScriptBundle;
}
