/**
 * On-device audio composition — Phase 7.
 * Pure recipes (mood → harmony/tempo/timbre, SFX → sweep shapes) plus
 * WebAudio renderers that run only in the browser. Synthesized drafts,
 * honestly labeled — never presented as studio recordings.
 */

export const MUSIC_MOODS = [
  "Cinematic",
  "Corporate",
  "Documentary",
  "Emotional",
  "Energetic",
  "Ambient",
  "Suspense",
  "Technology",
  "Inspirational",
] as const;

export type MusicMood = (typeof MUSIC_MOODS)[number];

export interface MusicRecipe {
  mood: MusicMood;
  bpm: number;
  root: number; // Hz
  mode: "major" | "minor" | "dorian";
  wave: OscillatorType;
  energy: number; // 0–1 brightness/density
  seconds: number;
}

const MOOD_TABLE: Record<MusicMood, { bpm: number; root: number; mode: "major" | "minor" | "dorian"; wave: OscillatorType; energy: number }> = {
  Cinematic: { bpm: 80, root: 110.0, mode: "minor", wave: "sawtooth", energy: 0.8 },
  Corporate: { bpm: 112, root: 130.81, mode: "major", wave: "triangle", energy: 0.6 },
  Documentary: { bpm: 92, root: 98.0, mode: "dorian", wave: "sine", energy: 0.5 },
  Emotional: { bpm: 70, root: 146.83, mode: "major", wave: "sine", energy: 0.4 },
  Energetic: { bpm: 128, root: 123.47, mode: "major", wave: "square", energy: 0.9 },
  Ambient: { bpm: 60, root: 87.31, mode: "major", wave: "sine", energy: 0.25 },
  Suspense: { bpm: 66, root: 82.41, mode: "minor", wave: "sawtooth", energy: 0.55 },
  Technology: { bpm: 120, root: 138.59, mode: "dorian", wave: "square", energy: 0.7 },
  Inspirational: { bpm: 100, root: 164.81, mode: "major", wave: "triangle", energy: 0.65 },
};

export function musicRecipe(mood: MusicMood, seconds: number): MusicRecipe {
  const base = MOOD_TABLE[mood];
  return { mood, ...base, seconds: Math.min(60, Math.max(4, Math.round(seconds))) };
}

/** Semitone offsets for a two-bar i–VI–III–VII style loop per mode. */
const PROGRESSIONS: Record<MusicRecipe["mode"], number[]> = {
  major: [0, -4, 3, -2],
  minor: [0, -4, -2, -5],
  dorian: [0, -2, 3, -4],
};

export function progressionFor(mode: MusicRecipe["mode"]): number[] {
  return PROGRESSIONS[mode];
}

export function noteFrequency(rootHz: number, semitones: number): number {
  return rootHz * Math.pow(2, semitones / 12);
}

export const SFX_TYPES = [
  "Whoosh",
  "Impact",
  "Notification",
  "Transition",
  "Environment",
  "Crowd",
  "Nature",
  "Mechanical",
] as const;

export type SfxType = (typeof SFX_TYPES)[number];

export interface SfxRecipe {
  type: SfxType;
  seconds: number;
}

export function sfxRecipe(type: SfxType): SfxRecipe {
  const durations: Record<SfxType, number> = {
    Whoosh: 0.8,
    Impact: 1.2,
    Notification: 0.6,
    Transition: 0.5,
    Environment: 3.0,
    Crowd: 2.5,
    Nature: 3.0,
    Mechanical: 1.0,
  };
  return { type, seconds: durations[type] };
}

/* ---------------- Browser renderers (WebAudio, client-only) ---------------- */

function ensureContext(): AudioContext {
  if (typeof window === "undefined") throw new Error("Audio renders in the browser only.");
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) throw new Error("This browser does not support WebAudio.");
  return new AC();
}

/** Render a looping music bed. Returns buffer + context (caller closes). */
export function renderMusic(recipe: MusicRecipe): { context: AudioContext; buffer: AudioBuffer } {
  const context = ensureContext();
  const sampleRate = context.sampleRate;
  const buffer = context.createBuffer(2, Math.floor(sampleRate * recipe.seconds), sampleRate);
  const steps = progressionFor(recipe.mode);
  const beatSec = 60 / recipe.bpm;
  const chordSec = beatSec * 2;

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    const t = (i: number) => i / sampleRate;
    const chordIndex = (time: number) => Math.floor(time / chordSec) % steps.length;
    // Pad chords.
    for (let i = 0; i < data.length; i++) {
      const time = t(i);
      const semis = steps[chordIndex(time)];
      const f = noteFrequency(recipe.root, semis);
      const attack = Math.min(1, (time % chordSec) / 0.4);
      const release = Math.min(1, (chordSec - (time % chordSec)) / 0.6);
      const env = Math.min(attack, release);
      const osc = Math.sin(2 * Math.PI * f * time) * 0.5 + Math.sin(2 * Math.PI * f * 2 * time) * 0.2 * recipe.energy;
      data[i] += osc * env * 0.28;
    }
    // Pulse on the beat for energy.
    const pulses = Math.floor(recipe.energy * 4);
    for (let p = 0; p < pulses; p++) {
      const start = Math.floor(((p * beatSec) / recipe.seconds) * data.length);
      const len = Math.floor(sampleRate * 0.06);
      for (let i = 0; i < len && start + i < data.length; i++) {
        data[start + i] += Math.sin(2 * Math.PI * recipe.root * 2 * (i / sampleRate)) * 0.12 * (1 - i / len);
      }
    }
  }
  return { context, buffer };
}

/** Render a synthesized sound effect. */
export function renderSfx(recipe: SfxRecipe): { context: AudioContext; buffer: AudioBuffer } {
  const context = ensureContext();
  const sampleRate = context.sampleRate;
  const buffer = context.createBuffer(1, Math.floor(sampleRate * recipe.seconds), sampleRate);
  const data = buffer.getChannelData(0);
  const n = data.length;

  const noise = () => Math.random() * 2 - 1;
  switch (recipe.type) {
    case "Whoosh": {
      for (let i = 0; i < n; i++) {
        const p = i / n;
        data[i] = noise() * Math.sin(Math.PI * p) * 0.5;
      }
      break;
    }
    case "Impact": {
      for (let i = 0; i < n; i++) {
        const t = i / sampleRate;
        data[i] = Math.sin(2 * Math.PI * (120 * Math.exp(-t * 4) + 40) * t) * Math.exp(-t * 3) * 0.8;
      }
      break;
    }
    case "Notification": {
      for (let i = 0; i < n; i++) {
        const t = i / sampleRate;
        const f = t < 0.25 ? 880 : 1174.66;
        const local = t < 0.25 ? t : t - 0.25;
        data[i] = Math.sin(2 * Math.PI * f * local) * Math.exp(-local * 8) * 0.5;
      }
      break;
    }
    case "Transition": {
      for (let i = 0; i < n; i++) {
        const p = i / n;
        data[i] = Math.sin(2 * Math.PI * (300 + p * 900) * (i / sampleRate)) * Math.sin(Math.PI * p) * 0.4;
      }
      break;
    }
    default: {
      // Environment / Crowd / Nature / Mechanical: textured beds.
      for (let i = 0; i < n; i++) {
        const t = i / sampleRate;
        data[i] =
          (noise() * 0.12 + Math.sin(2 * Math.PI * 196 * t) * 0.1 + Math.sin(2 * Math.PI * 392 * t) * 0.06) *
          Math.min(1, t * 2) *
          Math.min(1, (recipe.seconds - t) * 2);
      }
    }
  }
  return { context, buffer };
}

/** System TTS voices available on this device (empty until voices load). */
export function listSystemVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  return window.speechSynthesis.getVoices();
}

export function speakText(text: string, opts: { voiceName?: string; rate: number; pitch: number; lang: string }): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    throw new Error("Speech synthesis is unavailable in this browser.");
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text.slice(0, 2000));
  utterance.rate = opts.rate;
  utterance.pitch = opts.pitch;
  utterance.lang = opts.lang;
  const match = window.speechSynthesis.getVoices().find((v) => v.name === opts.voiceName);
  if (match) utterance.voice = match;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeech(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
