import type { ScriptSection } from "@/src/lib/script/types";

/** Word/character/runtime math. Estimates, never exact — labeled as such in UI. */

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function countChars(text: string): number {
  return text.length;
}

/** Whole seconds at the given speaking rate. */
export function estimateSeconds(words: number, wpm: number): number {
  if (wpm <= 0) throw new Error("Speaking rate must be positive.");
  return Math.round((words / wpm) * 60);
}

export function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function sectionWords(section: Pick<ScriptSection, "text">): number {
  return countWords(section.text);
}

/** Narration excludes creator notes by construction — notes live elsewhere. */
export function scriptWords(sections: Pick<ScriptSection, "text">[]): number {
  return sections.reduce((n, s) => n + countWords(s.text), 0);
}

export function splitSentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+["”)]?\s*/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
}

/**
 * Extractive shorten: keep the opening and highest-density sentences.
 * Deterministic and transparent — labeled as an extract, not a rewrite.
 */
export function extractShorten(text: string, keepRatio = 0.4): string {
  const sentences = splitSentences(text);
  if (sentences.length <= 2) return text;
  const keep = Math.max(1, Math.round(sentences.length * keepRatio));
  const scored = sentences.map((s, i) => ({
    s,
    i,
    score: new Set(s.toLowerCase().split(/\W+/)).size / Math.max(1, s.split(/\s+/).length) + (i === 0 ? 0.5 : 0),
  }));
  scored.sort((a, b) => b.score - a.score);
  const chosen = new Set(scored.slice(0, keep).map((x) => x.i));
  return sentences.filter((_, i) => chosen.has(i)).join(" ");
}
