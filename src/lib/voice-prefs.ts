/** Narrator voice and delivery style, remembered on this device. */

export const VOICE_STYLE_OPTIONS = [
  { id: "natural", label: "Natural", hint: "Relaxed, like talking to a friend" },
  { id: "energetic", label: "Energetic", hint: "Upbeat YouTuber" },
  { id: "calm", label: "Calm", hint: "Gentle and reassuring" },
  { id: "storyteller", label: "Storyteller", hint: "Expressive, builds suspense" },
  { id: "documentary", label: "Documentary", hint: "Clear and confident" },
] as const;
export type VoiceStyleId = (typeof VOICE_STYLE_OPTIONS)[number]["id"];

/** Narration voices, with how each one sounds. */
export const NARRATOR_VOICES: { id: string; sound: string }[] = [
  { id: "Achird", sound: "Friendly" },
  { id: "Sulafat", sound: "Warm" },
  { id: "Zubenelgenubi", sound: "Casual" },
  { id: "Callirrhoe", sound: "Easy-going" },
  { id: "Umbriel", sound: "Easy-going" },
  { id: "Puck", sound: "Upbeat" },
  { id: "Sadachbia", sound: "Lively" },
  { id: "Laomedeia", sound: "Upbeat" },
  { id: "Aoede", sound: "Breezy" },
  { id: "Vindemiatrix", sound: "Gentle" },
  { id: "Achernar", sound: "Soft" },
  { id: "Algieba", sound: "Smooth" },
  { id: "Despina", sound: "Smooth" },
  { id: "Charon", sound: "Informative" },
  { id: "Sadaltager", sound: "Knowledgeable" },
  { id: "Iapetus", sound: "Clear" },
  { id: "Erinome", sound: "Clear" },
  { id: "Gacrux", sound: "Mature" },
  { id: "Algenib", sound: "Gravelly" },
  { id: "Kore", sound: "Firm" },
  { id: "Orus", sound: "Firm" },
  { id: "Fenrir", sound: "Excitable" },
  { id: "Leda", sound: "Youthful" },
  { id: "Zephyr", sound: "Bright" },
];

const KEY = "rt-narrator";

export function readVoicePrefs(): { voice?: string; style: VoiceStyleId } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as { voice?: string; style?: string };
    const style = VOICE_STYLE_OPTIONS.some((s) => s.id === v.style) ? (v.style as VoiceStyleId) : "natural";
    const voice = NARRATOR_VOICES.some((n) => n.id === v.voice) ? v.voice : undefined;
    return { voice, style };
  } catch {
    return { style: "natural" };
  }
}

export function saveVoicePrefs(p: { voice?: string; style?: VoiceStyleId }): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readVoicePrefs(), ...p }));
  } catch {
    // Private mode: the choice just isn't remembered.
  }
}
