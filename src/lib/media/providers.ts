import type { MediaKind } from "@/src/lib/media/types";

/**
 * Provider capability system. The UI exposes only what the selected
 * provider supports; unsupported controls render as explained boundaries.
 * "ai-provider" is Google Gemini via the server routes (image + TTS); video,
 * music, and SFX synthesis stay gated behind request drafts.
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
    label: "Gemini (AI)",
    blurb: "Real AI images and studio-quality narration via Google Gemini. Requires sign-in.",
    available: true,
    unavailableReason: "",
    capabilities: {
      image: true,
      video: false,
      tts: true,
      music: false,
      sfx: false,
      reference: false,
      variations: true,
    },
    capabilityNotes: {
      video: "Gemini does not generate video here yet. Save a request draft with full parameters instead.",
      music: "Gemini does not generate music. Use on-device drafts or upload licensed tracks.",
      sfx: "Gemini does not generate sound effects. Use on-device drafts or uploads.",
      reference: "Reference-image conditioning is not wired yet.",
    },
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
