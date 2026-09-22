import { z } from "zod";
import type {
  PackTitle,
  PlatformId,
  PlatformPack,
  RepurposeItem,
  SeoPackage,
  ThumbnailConcept,
  ThumbnailVariant,
} from "@/src/lib/package/types";

const approval = z.enum(["draft", "review", "approved", "ready"]);

const conceptSchema = z.object({
  id: z.string(),
  name: z.string(),
  visual: z.string(),
  subject: z.string(),
  composition: z.string(),
  textDirection: z.string(),
  emotion: z.string(),
  contrast: z.string(),
  background: z.string(),
  brandNotes: z.string(),
});

const overlaySchema = z.object({
  id: z.string(),
  text: z.string(),
  x: z.number(),
  y: z.number(),
  size: z.number(),
  color: z.string(),
  weight: z.number(),
  align: z.enum(["left", "center", "right"]),
});

const variantSchema = z.object({
  id: z.string(),
  name: z.string(),
  conceptId: z.string().optional(),
  baseKind: z.enum(["svg-draft", "upload"]),
  baseAssetId: z.string().optional(),
  baseSvg: z.string().optional(),
  overlays: z.array(overlaySchema),
  approval,
  createdAt: z.string(),
  updatedAt: z.string(),
});

const titleSchema = z.object({
  id: z.string(),
  text: z.string(),
  category: z.string(),
  status: approval,
  isPrimary: z.boolean(),
  createdAt: z.string(),
});

const chapterSchema = z.object({ timeSec: z.number(), title: z.string() });

const seoSchema = z.object({
  projectId: z.string(),
  topic: z.string(),
  secondaryTopics: z.string(),
  intent: z.string(),
  description: z.string(),
  keywords: z.array(z.string()),
  tags: z.array(z.string()),
  hashtags: z.array(z.string()),
  chapters: z.array(chapterSchema),
  category: z.string(),
  language: z.string(),
  audience: z.string(),
  approval,
  updatedAt: z.string(),
});

const packSchema = z.object({
  platform: z.string(),
  fields: z.record(z.string(), z.string()),
  approval,
  updatedAt: z.string(),
});

const repurposeSchema = z.object({
  id: z.string(),
  kind: z.string(),
  platform: z.string(),
  hook: z.string(),
  body: z.string(),
  cta: z.string(),
  sourceRef: z.string(),
  status: approval,
  createdAt: z.string(),
  updatedAt: z.string(),
});

const bundleSchema = z.object({
  version: z.literal(1),
  concepts: z.array(conceptSchema),
  variants: z.array(variantSchema),
  titles: z.array(titleSchema),
  seo: z.array(seoSchema),
  packs: z.array(packSchema),
  items: z.array(repurposeSchema),
});

export interface PackageBundle {
  version: 1;
  concepts: ThumbnailConcept[];
  variants: ThumbnailVariant[];
  titles: PackTitle[];
  seo: SeoPackage[];
  packs: PlatformPack[];
  items: RepurposeItem[];
}

export const PACKAGE_STORAGE_KEY = "tuberack.package.v1";

export function emptyPackageBundle(): PackageBundle {
  return { version: 1, concepts: [], variants: [], titles: [], seo: [], packs: [], items: [] };
}

export function parsePackageBundle(data: unknown): PackageBundle {
  const parsed = bundleSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Import is not a TubeRack package file: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "root"} — ${i.message}`).join("; ")}`,
    );
  }
  return parsed.data as PackageBundle;
}
