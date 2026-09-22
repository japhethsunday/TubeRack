import type { MediaKind } from "@/src/lib/media/types";

/**
 * Provider capability system. The UI exposes only what the selected
 * provider supports; unsupported controls render as explained boundaries.
 * Real vendor capabilities wire up in Phase 11 — this matrix declares the
 * on-device engine honestly and gates everything else.
 */

export type Capability =
  | "image"
  | "video"
  | "tts"
  | "music"
  | "sfx"
  | "reference"
  | "variations";

export interface ProviderDef {
  id: string;
  label: string;
  blurb: string;
  available: boolean;
  unavailableReason: string;
  capabilities: Record<Capability, boolean>;
  capabilityNotes: Partial<Record<Capability, string>>;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: "on-device",
    label: "On-device drafts",
    blurb: "SVG visuals, system-voice TTS, synthesized music/SFX. Free, instant, clearly labeled drafts.",
    available: true,
    unavailableReason: "",
    capabilities: {
      image: true,
      video: false,
      tts: true,
      music: true,
      sfx: true,
      reference: false,
      variations: true,
    },
    capabilityNotes: {
      image: "Deterministic SVG compositions — layout drafts, not photography.",
      video: "Video synthesis needs a provider. Save a request draft instead.",
      tts: "System voices vary by device and browser.",
      reference: "Reference images need a provider pipeline (Phase 11).",
    },
  },
  {
    id: "ai-provider",
    label: "AI provider",
    blurb: "Photoreal image/video, studio TTS, licensed music. Connects in Phase 11.",
    available: false,
    unavailableReason: "No AI provider is configured. Requests are saved as drafts with full parameters for Phase 11.",
    capabilities: {
      image: true,
      video: true,
      tts: true,
      music: true,
      sfx: true,
      reference: true,
      variations: true,
    },
    capabilityNotes: {},
  },
];

export function providerById(id: string): ProviderDef {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
}

/** Gate an operation: returns null when supported, else the reason. */
export function capabilityBlock(providerId: string, capability: Capability): string | null {
  const provider = providerById(providerId);
  if (!provider.available) return provider.unavailableReason;
  if (!provider.capabilities[capability]) {
    return provider.capabilityNotes[capability] ?? "Not supported by this provider.";
  }
  return null;
}

export const KIND_CAPABILITY: Record<MediaKind, Capability> = {
  image: "image",
  video: "video",
  voice: "tts",
  music: "music",
  sfx: "sfx",
};
