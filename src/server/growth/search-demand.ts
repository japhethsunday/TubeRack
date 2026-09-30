/**
 * What creators actually type into YouTube search, from YouTube's public
 * search suggestions (no key, no cost). Used so teaching Shorts answer real
 * searches ("how to get 1000 subscribers on youtube") instead of guesses.
 * Best effort: any failure returns an empty list and the AI picks a topic.
 */

const SEEDS = [
  "how to grow on youtube",
  "how to get subscribers on youtube",
  "how to go viral on youtube shorts",
  "how to post on tiktok",
  "how to grow on tiktok",
  "how to start a faceless youtube channel",
  "how to make youtube shorts",
  "how to write a youtube script",
  "how to get views on youtube",
  "how to monetize youtube channel",
  "how to edit youtube videos",
  "how to make a thumbnail",
  "how to find a niche for youtube",
  "how to upload on youtube",
  "how to make money on youtube",
  "how to start youtube with no money",
];

/** Parse the suggestion API reply: ["query", ["suggestion", ...], ...]. */
export function parseSuggestions(body: unknown): string[] {
  if (!Array.isArray(body) || !Array.isArray(body[1])) return [];
  return (body[1] as unknown[])
    .map((s) => (typeof s === "string" ? s.trim().toLowerCase() : ""))
    .filter((s) => s.length >= 10 && s.length <= 90 && /^how\b/.test(s) && !/[<>{}]/.test(s));
}

async function suggest(q: string): Promise<string[]> {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=en&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(4000), cache: "no-store" });
  if (!res.ok) return [];
  return parseSuggestions(await res.json());
}

/** Real "how to…" searches from a few random seeds, minus topics already covered. */
export async function searchedHowTos(avoid: string[], seed = Date.now()): Promise<string[]> {
  const picks = [0, 5, 11].map((k) => SEEDS[(Math.floor(seed / 1000) + k) % SEEDS.length]);
  const lists = await Promise.all(picks.map((q) => suggest(q).catch(() => [] as string[])));
  const used = avoid.join(" ").toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of lists.flat()) {
    const key = s.replace(/\s+/g, " ");
    // Skip ones we've already made a video about (title/hook share the exact phrase).
    if (seen.has(key) || used.includes(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out.slice(0, 15);
}
