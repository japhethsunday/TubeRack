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
  {
    id: "comfyui",
    label: "ComfyUI (self-hosted)",
    blurb: "Your own ComfyUI workflow on GPU infrastructure. Runs as a background job.",
    available: false,
    unavailableReason: "ComfyUI is not configured or not reachable (COMFYUI_URL + COMFYUI_WORKFLOW).",
    capabilities: { image: true, video: false, tts: false, music: false, sfx: false, reference: false, variations: true },
    capabilityNotes: { tts: "ComfyUI generates images only here.", music: "ComfyUI generates images only here.", sfx: "ComfyUI generates images only here.", video: "Video workflows are not wired." },
  },
  {
    id: "piper",
    label: "Piper (self-hosted TTS)",
    blurb: "Fast local text-to-speech on CPU. Runs as a background job.",
    available: false,
    unavailableReason: "Piper is not configured or not reachable (PIPER_URL).",
    capabilities: { image: false, video: false, tts: true, music: false, sfx: false, reference: false, variations: false },
    capabilityNotes: { image: "Piper is text-to-speech only.", music: "Piper is text-to-speech only.", sfx: "Piper is text-to-speech only.", video: "Piper is text-to-speech only." },
  },
  {
    id: "ace-step",
    label: "ACE-Step (self-hosted music)",
    blurb: "AI music generation on GPU infrastructure. Runs as a background job.",
    available: false,
    unavailableReason: "ACE-Step is not configured or not reachable (ACE_STEP_URL).",
    capabilities: { image: false, video: false, tts: false, music: true, sfx: false, reference: false, variations: false },
    capabilityNotes: { image: "ACE-Step generates music only.", tts: "ACE-Step generates music only.", sfx: "Use on-device effects or uploads.", video: "ACE-Step generates music only." },
  },
];

/** Providers executed by the job worker (vs. instant cloud/on-device). */
export const JOB_PROVIDERS = new Set(["comfyui", "piper", "ace-step"]);

/** Merge live registry availability into the static matrix. */
export function withAvailability(usable: (name: string) => boolean): ProviderDef[] {
  return PROVIDERS.map((p) => (JOB_PROVIDERS.has(p.id) ? { ...p, available: usable(p.id) } : p));
}

/** Gate against a specific (availability-merged) list. */
export function blockIn(list: ProviderDef[], providerId: string, capability: Capability): string | null {
  const provider = list.find((p) => p.id === providerId) ?? list[0];
  if (!provider.available) return provider.unavailableReason;
  if (!provider.capabilities[capability]) return provider.capabilityNotes[capability] ?? "Not supported by this provider.";
  return null;
}

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
