import type { Composition, TimelineClip } from "@/src/lib/video/types";

/**
 * The audio mix, shared by the live preview and the exporter so what you hear
 * is what you export: clip volume × track volume, music sits a little under
 * everything, and dips further while someone is speaking (auto-ducking).
 */
export const MUSIC_BASE = 0.8;
/** Music level while a voice clip is playing (fraction of its normal level). */
export const MUSIC_DUCK = 0.3;

export function trackVolume(comp: Pick<Composition, "tracks">, trackId: string): number {
  const v = comp.tracks.find((t) => t.id === trackId)?.volume;
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(2, v)) : 1;
}

function audibleVoice(comp: Pick<Composition, "tracks" | "clips">): TimelineClip[] {
  const muted = new Set(comp.tracks.filter((t) => t.muted).map((t) => t.id));
  return comp.clips.filter((c) => c.kind === "voice" && !c.muted && !muted.has(c.trackId) && c.volume > 0 && trackVolume(comp, c.trackId) > 0);
}

/** Time ranges (timeline seconds) where a voice is speaking, merged. */
export function voiceRanges(comp: Pick<Composition, "tracks" | "clips">): [number, number][] {
  const ranges = audibleVoice(comp)
    .map((c) => [c.startSec, c.startSec + c.durationSec] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const r of ranges) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + 0.25) last[1] = Math.max(last[1], r[1]);
    else out.push([...r]);
  }
  return out;
}

export function voiceActiveAt(comp: Pick<Composition, "tracks" | "clips">, t: number): boolean {
  return voiceRanges(comp).some(([a, b]) => t >= a && t < b);
}

/** Gain for an audio clip before fades (clip × track × music level × ducking at time t). */
export function mixGain(comp: Pick<Composition, "tracks" | "clips">, clip: TimelineClip, t?: number): number {
  let g = clip.volume * trackVolume(comp, clip.trackId);
  if (clip.kind === "music") {
    g *= MUSIC_BASE;
    if (t !== undefined && voiceActiveAt(comp, t)) g *= MUSIC_DUCK;
  }
  return g;
}
