import type { Chapter } from "@/src/lib/package/types";

/**
 * SEO workspace logic — Phase 9.
 * Keywords come from real script frequency (stopword-filtered, counts shown).
 * Chapters come from real scene timestamps. Reviews check structure, never
 * scores. Search volumes, rankings, and difficulty are never fabricated.
 */

const STOPWORDS = new Set(
  "the,a,an,and,or,but,if,then,else,for,to,of,in,on,at,by,with,from,as,is,are,was,were,be,been,being,have,has,had,do,does,did,will,would,can,could,should,may,might,must,this,that,these,those,you,your,we,our,they,their,he,she,it,its,not,no,yes,all,any,each,other,some,such,than,too,very,just,about,into,over,after,before,between,through,during,when,where,what,why,how,which,who,whom,because,while,also,only,own,same,so,up,out,off,i,me,my,myself,we,us,our,video,watch,make,made,like,get,got,going,one,two,more,most,many,much,really,thing,things,here,there,now,today".split(","),
);

export interface KeywordCandidate {
  term: string;
  count: number;
  density: number; // share of eligible words, for stuffing checks
}

/** Frequency-ranked keywords from real script text. Counts are shown, never volumes. */
export function extractKeywords(text: string, limit = 12): { keywords: KeywordCandidate[]; totalWords: number } {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  const keywords = [...counts.entries()]
    .map(([term, count]) => ({ term, count, density: words.length > 0 ? count / words.length : 0 }))
    .filter((k) => k.count >= 2)
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, limit);
  return { keywords, totalWords: words.length };
}

export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

export function parseTimestamp(value: string): number | null {
  const parts = value.trim().split(":").map((p) => p.trim());
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  const [h, m, s] = nums.length === 3 ? nums : [0, ...nums];
  if (m >= 60 || s >= 60) return null;
  return h * 3600 + m * 60 + s;
}

/** Chapters from real scene segments. First chapter is forced to 0:00. */
export function chaptersFromSegments(segments: { title: string; startSec: number }[]): Chapter[] {
  return segments.map((s, i) => ({
    timeSec: i === 0 ? 0 : Math.max(0, Math.floor(s.startSec)),
    title: s.title.trim() || `Part ${i + 1}`,
  }));
}

export function chaptersToText(chapters: Chapter[]): string {
  return chapters.map((c) => `${formatTimestamp(c.timeSec)} ${c.title}`).join("\n");
}

export interface DescriptionInput {
  promise: string;
  topic: string;
  takeaway: string;
  cta: string;
  chapters: Chapter[];
  hashtags: string[];
  links: { label: string; url: string }[];
}

/** Structured description assembly. Placeholders stay visible — never fake URLs. */
export function buildDescription(input: DescriptionInput): string {
  const lines: string[] = [];
  if (input.promise.trim()) lines.push(input.promise.trim(), "");
  if (input.topic.trim()) lines.push(input.topic.trim(), "");
  if (input.takeaway.trim()) lines.push(`In this video: ${input.takeaway.trim()}`, "");
  if (input.links.length > 0) {
    lines.push("Links:");
    for (const l of input.links) lines.push(`- ${l.label}: ${l.url}`);
    lines.push("");
  }
  if (input.chapters.length > 0) {
    lines.push("Chapters:");
    lines.push(chaptersToText(input.chapters), "");
  }
  if (input.cta.trim()) lines.push(input.cta.trim(), "");
  lines.push("[Sponsor disclosure — add here only if this video is sponsored.]");
  if (input.hashtags.length > 0) lines.push("", input.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" "));
  return lines.join("\n").trim();
}

export interface SeoCheck {
  check: string;
  verdict: "pass" | "watch" | "issue";
  note: string;
}

export interface SeoReviewInput {
  topic: string;
  intent: string;
  title: string;
  description: string;
  keywords: string[];
  tags: string[];
  chapters: Chapter[];
  durationSec: number;
}

/** Structural SEO review. Completeness and alignment — never a score. */
export function reviewSeo(input: SeoReviewInput): { checks: SeoCheck[]; summary: string } {
  const checks: SeoCheck[] = [];
  const descWords = input.description.trim().split(/\s+/).filter(Boolean);

  checks.push({
    check: "Topic clarity",
    verdict: input.topic.trim().length >= 8 ? "pass" : "issue",
    note: input.topic.trim().length >= 8 ? "A concrete topic anchors every field." : "State the topic in 8+ characters before anything else.",
  });

  checks.push({
    check: "Search intent",
    verdict: input.intent.trim().length > 0 ? "pass" : "watch",
    note: input.intent.trim() ? "Intent guides title and description phrasing." : "Name what the searcher wants: learn, compare, fix, or decide.",
  });

  checks.push({
    check: "Description completeness",
    verdict: descWords.length >= 120 ? "pass" : descWords.length >= 40 ? "watch" : "issue",
    note: `${descWords.length} words — aim for 120+ with promise, context, chapters, and CTA.`,
  });

  const significant = (s: string) =>
    new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
  const titleTerms = significant(input.title);
  const descTerms = significant(input.description);
  const shared = [...titleTerms].filter((w) => descTerms.has(w));
  checks.push({
    check: "Title/description alignment",
    verdict: titleTerms.size === 0 ? "watch" : shared.length >= 2 ? "pass" : "issue",
    note:
      titleTerms.size === 0
        ? "Set a primary title first — alignment is measured against it."
        : shared.length >= 2
          ? `${shared.length} shared terms — packaging promises one video.`
          : "Title and description share almost no terms — verify they promise the same video.",
  });

  const kwSet = new Set(input.keywords.map((k) => k.toLowerCase()));
  const stuffed = [...kwSet].filter((k) => {
    const occurrences = descWords.filter((w) => w.toLowerCase() === k).length;
    return descWords.length > 0 && occurrences / descWords.length > 0.04 && occurrences >= 4;
  });
  checks.push({
    check: "Keyword stuffing",
    verdict: stuffed.length > 0 ? "issue" : "pass",
    note: stuffed.length > 0 ? `“${stuffed[0]}” repeats unnaturally — write for humans first.` : "No stuffing patterns detected.",
  });

  const sorted = [...input.chapters].sort((a, b) => a.timeSec - b.timeSec);
  const coverage = sorted.length > 0 && sorted[0].timeSec === 0;
  checks.push({
    check: "Chapters",
    verdict: sorted.length === 0 ? "watch" : coverage ? "pass" : "issue",
    note:
      sorted.length === 0
        ? "No chapters — generate them from scene timestamps."
        : coverage
          ? `${sorted.length} chapter(s) from 0:00.`
          : "First chapter must start at 0:00.",
  });

  const issues = checks.filter((c) => c.verdict === "issue").length;
  const watches = checks.filter((c) => c.verdict === "watch").length;
  return {
    checks,
    summary: issues === 0 && watches === 0 ? "Complete across all checks." : `${issues} blocking, ${watches} to improve. Fix blocking items first.`,
  };
}
