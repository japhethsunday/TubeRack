/**
 * Beats: a scene's narration split into short spoken moments (a sentence or
 * two). Each beat gets its own visual, timed to when it's said, so the
 * picture always shows what the voice is talking about right now.
 */

export interface Beat {
  text: string;
  /** Where the beat starts and ends in the scene, as fractions of its length (by word count). */
  from: number;
  to: number;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

export function splitBeats(text: string, maxBeats: number, targetWords = 18): Beat[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.split(/(?<=[.!?…])\s+(?=[^\s])/).filter(Boolean);
  // Group sentences into beats of roughly targetWords.
  let groups: string[] = [];
  let cur = "";
  for (const s of sentences) {
    cur = cur ? `${cur} ${s}` : s;
    if (words(cur) >= targetWords) {
      groups.push(cur);
      cur = "";
    }
  }
  if (cur) {
    // A short tail joins the previous beat rather than flashing by.
    if (groups.length && words(cur) < targetWords / 2) groups[groups.length - 1] += ` ${cur}`;
    else groups.push(cur);
  }
  // Too many beats: merge the shortest neighbouring pair until it fits.
  const cap = Math.max(1, maxBeats);
  while (groups.length > cap) {
    let best = 0;
    for (let i = 1; i < groups.length - 1; i++) {
      if (words(groups[i]) + words(groups[i + 1]) < words(groups[best]) + words(groups[best + 1])) best = i;
    }
    groups = [...groups.slice(0, best), `${groups[best]} ${groups[best + 1]}`, ...groups.slice(best + 2)];
  }
  const total = Math.max(1, words(clean));
  let at = 0;
  return groups.map((g, i) => {
    const from = at / total;
    at += words(g);
    return { text: g, from: Math.round(from * 1000) / 1000, to: i === groups.length - 1 ? 1 : Math.round((at / total) * 1000) / 1000 };
  });
}

/** Beats for every scene, sharing a total budget (each beat is one visual to make). */
export function planBeats(texts: string[], budget = 24): Beat[][] {
  const counts = texts.map(words);
  const total = Math.max(1, counts.reduce((a, b) => a + b, 0));
  return texts.map((t, i) => splitBeats(t, Math.max(1, Math.min(8, Math.round((budget * counts[i]) / total)))));
}

export const beatTag = (b: Pick<Beat, "from" | "to">) => `beat:${b.from.toFixed(3)}-${b.to.toFixed(3)}`;

export function beatOf(tags: string[] | undefined): { from: number; to: number } | null {
  const t = tags?.find((x) => x.startsWith("beat:"));
  if (!t) return null;
  const [from, to] = t.slice(5).split("-").map(Number);
  return Number.isFinite(from) && Number.isFinite(to) ? { from, to } : null;
}
