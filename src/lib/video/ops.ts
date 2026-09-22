import type { TimelineClip } from "@/src/lib/video/types";

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

/** For tests: deterministic ids. */
export function __resetClipIds(): void {
  seq = 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Snap a time to nearby candidates (scene edges, playhead, clip edges). */
export function snapTime(timeSec: number, candidates: number[], enabled: boolean, threshold = 0.25): number {
  if (!enabled) return round1(timeSec);
  let best = timeSec;
  let bestDist = threshold;
  for (const c of candidates) {
    const d = Math.abs(c - timeSec);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return round1(best);
}

export function snapCandidates(clips: TimelineClip[], excludeId: string, playhead: number, segments: number[]): number[] {
  const out = [...segments, playhead];
  for (const c of clips) {
    if (c.id === excludeId) continue;
    out.push(c.startSec, round1(c.startSec + c.durationSec));
  }
  return out;
}

export function moveClip(clips: TimelineClip[], id: string, deltaSec: number): TimelineClip[] {
  return clips.map((c) =>
    c.id === id ? { ...c, startSec: Math.max(0, round1(c.startSec + deltaSec)) } : c,
  );
}

export function trimClip(
  clips: TimelineClip[],
  id: string,
  edge: "start" | "end",
  deltaSec: number,
): TimelineClip[] {
  return clips.map((c) => {
    if (c.id !== id) return c;
    if (edge === "start") {
      const shift = Math.min(Math.max(-c.startSec, deltaSec), c.durationSec - 0.5);
      return { ...c, startSec: round1(c.startSec + shift), durationSec: round1(c.durationSec - shift) };
    }
    return { ...c, durationSec: Math.max(0.5, round1(c.durationSec + deltaSec)) };
  });
}

export function splitClipAt(clips: TimelineClip[], id: string, atSec: number): TimelineClip[] {
  const target = clips.find((c) => c.id === id);
  if (!target) return clips;
  const offset = round1(atSec - target.startSec);
  if (offset <= 0.25 || offset >= target.durationSec - 0.25) return clips;
  const first: TimelineClip = { ...target, durationSec: offset };
  const second: TimelineClip = {
    ...target,
    id: nextId("clip"),
    name: `${target.name} (2)`,
    startSec: round1(target.startSec + offset),
    durationSec: round1(target.durationSec - offset),
  };
  return clips.flatMap((c) => (c.id === id ? [first, second] : [c]));
}

export function duplicateClip(clips: TimelineClip[], id: string): TimelineClip[] {
  const target = clips.find((c) => c.id === id);
  if (!target) return clips;
  return [
    ...clips,
    { ...target, id: nextId("clip"), name: `${target.name} (copy)`, startSec: round1(target.startSec + target.durationSec) },
  ];
}

export function deleteClip(clips: TimelineClip[], id: string): TimelineClip[] {
  return clips.filter((c) => c.id !== id);
}

export function addClip(clips: TimelineClip[], clip: Omit<TimelineClip, "id">): TimelineClip[] {
  return [...clips, { ...clip, id: nextId("clip") }];
}
