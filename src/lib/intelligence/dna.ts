import { z } from "zod";

/**
 * Channel / Brand DNA — persistent creative context consumed by every
 * intelligence task and (later) every studio. Defined once per channel,
 * referenced everywhere, duplicated nowhere.
 */

export const dnaSchema = z.object({
  channelId: z.string().min(1),
  identity: z.string().trim().max(200).default(""),
  audience: z.string().trim().max(500).default(""),
  tone: z.string().trim().max(200).default(""),
  voice: z.string().trim().max(200).default(""),
  topics: z.string().trim().max(500).default(""),
  pillars: z.string().trim().max(500).default(""),
  formats: z.string().trim().max(300).default(""),
  visualIdentity: z.string().trim().max(500).default(""),
  useWords: z.string().trim().max(300).default(""),
  avoidWords: z.string().trim().max(300).default(""),
  positioning: z.string().trim().max(500).default(""),
  updatedAt: z.string(),
});

export type ChannelDNA = z.infer<typeof dnaSchema>;

export function emptyDNA(channelId: string, at?: string): ChannelDNA {
  return {
    channelId,
    identity: "",
    audience: "",
    tone: "",
    voice: "",
    topics: "",
    pillars: "",
    formats: "",
    visualIdentity: "",
    useWords: "",
    avoidWords: "",
    positioning: "",
    updatedAt: at ?? new Date().toISOString(),
  };
}

export function parseDNA(data: unknown): ChannelDNA {
  const parsed = dnaSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Invalid brand DNA: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "root"} — ${i.message}`).join("; ")}`,
    );
  }
  return parsed.data;
}

const DNA_FIELDS: { key: keyof Omit<ChannelDNA, "channelId" | "updatedAt">; label: string }[] = [
  { key: "identity", label: "Channel identity" },
  { key: "audience", label: "Target audience" },
  { key: "tone", label: "Tone" },
  { key: "voice", label: "Voice" },
  { key: "topics", label: "Topics" },
  { key: "pillars", label: "Content pillars" },
  { key: "formats", label: "Preferred formats" },
  { key: "visualIdentity", label: "Visual identity" },
  { key: "useWords", label: "Words to use" },
  { key: "avoidWords", label: "Words to avoid" },
  { key: "positioning", label: "Positioning" },
];

export function dnaFields(): typeof DNA_FIELDS {
  return DNA_FIELDS;
}

/** Share of DNA fields filled (0–100). Coverage, not quality. */
export function dnaCompleteness(dna: ChannelDNA): number {
  const filled = DNA_FIELDS.filter((f) => dna[f.key].trim().length > 0).length;
  return Math.round((filled / DNA_FIELDS.length) * 100);
}

export function missingDnaFields(dna: ChannelDNA): string[] {
  return DNA_FIELDS.filter((f) => dna[f.key].trim().length === 0).map((f) => f.label);
}
