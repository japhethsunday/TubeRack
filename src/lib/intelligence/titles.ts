/**
 * Title analysis + generation — Phase 5.
 * Real text checks (length, caps, punctuation, specificity signals) with
 * disclosed guidance. Template-built directions the creator edits and saves.
 * No performance claims — ever.
 */

export type TitleVerdict = "pass" | "watch" | "flag";

export interface TitleCheck {
  check: string;
  verdict: TitleVerdict;
  note: string;
}

const VAGUE = ["amazing", "incredible", "insane", "unbelievable", "secret", "shocking", "crazy"];
const OUTCOME_VERBS = ["grow", "fix", "build", "learn", "stop", "start", "double", "master", "avoid", "save"];

export function analyzeTitle(title: string): { checks: TitleCheck[]; summary: string } {
  const t = title.trim();
  const checks: TitleCheck[] = [];
  const words = t.split(/\s+/).filter(Boolean);

  checks.push({
    check: "Length",
    verdict: t.length === 0 ? "flag" : t.length <= 60 ? "pass" : "watch",
    note:
      t.length === 0
        ? "Empty title."
        : t.length <= 60
          ? `${t.length} characters — typically displays in full.`
          : `${t.length} characters — likely truncated in browse. Front-load the payoff.`,
  });

  const capsWords = words.filter((w) => w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w));
  checks.push({
    check: "Capitalization",
    verdict: capsWords.length >= 2 || /^[A-Z\s!?.]+$/.test(t) ? "flag" : "pass",
    note:
      capsWords.length >= 2
        ? `Fully-capitalized words (${capsWords.slice(0, 3).join(", ")}) read as shouting and erode trust.`
        : "No shouting detected. Title case or sentence case both work.",
  });

  const bangs = (t.match(/!/g) ?? []).length + (t.match(/\?/g) ?? []).length;
  checks.push({
    check: "Punctuation",
    verdict: bangs >= 3 ? "flag" : bangs >= 2 ? "watch" : "pass",
    note:
      bangs >= 2
        ? "Multiple !/? marks cheapen the promise — keep at most one."
        : "Punctuation is restrained.",
  });

  const vague = VAGUE.filter((v) => t.toLowerCase().includes(v));
  checks.push({
    check: "Specificity",
    verdict: /\d/.test(t) || vague.length === 0 ? "pass" : "watch",
    note:
      /\d/.test(t)
        ? "Numbers make the promise concrete."
        : vague.length > 0
          ? `“${vague[0]}” promises feeling instead of substance — replace with a concrete noun or number.`
          : "Consider one number, timeframe, or proper noun.",
  });

  checks.push({
    check: "Curiosity",
    verdict: /\?|how|why|what|mistake|truth|vs\.?|versus/i.test(t) ? "pass" : "watch",
    note: /\?|how|why|what|mistake|truth|vs\.?|versus/i.test(t)
      ? "Opens an information gap."
      : "No explicit gap — add a question, contrast, or unknown.",
  });

  checks.push({
    check: "Promise",
    verdict: OUTCOME_VERBS.some((v) => t.toLowerCase().includes(v)) ? "pass" : "watch",
    note: OUTCOME_VERBS.some((v) => t.toLowerCase().includes(v))
      ? "Promises an outcome the video must deliver."
      : "No outcome verb — the viewer can't picture the payoff.",
  });

  const misleading = ["guaranteed", "100%", "instant", "overnight", "never fail", "everyone"];
  const hit = misleading.find((m) => t.toLowerCase().includes(m));
  checks.push({
    check: "Misleading language",
    verdict: hit ? "flag" : "pass",
    note: hit
      ? `“${hit}” overpromises — if the video can't prove it, retention and trust collapse.`
      : "No absolute claims detected.",
  });

  const flags = checks.filter((c) => c.verdict === "flag").length;
  const watches = checks.filter((c) => c.verdict === "watch").length;
  return {
    checks,
    summary:
      t.length === 0
        ? "Enter a title to analyze."
        : flags === 0 && watches === 0
          ? "Clean across all checks. Compare 2–3 directions before locking it."
          : `${flags} blocking issue(s), ${watches} suggestion(s). Fix flags first — they cost trust.`,
  };
}

export interface TitleDirection {
  category: string;
  variants: string[];
}

const DIRECTIONS: { category: string; build: (topic: string, audience: string) => string[] }[] = [
  { category: "Curiosity", build: (t) => [`What nobody tells you about ${t}`, `The ${t} mistake almost everyone makes`] },
  { category: "Benefit", build: (t) => [`Fix your ${t} in one weekend`, `A calmer way to handle ${t}`] },
  { category: "Story", build: (t) => [`How ${t} cost me a year (and what fixed it)`, `I tried ${t} for 30 days`] },
  { category: "Question", build: (t, a) => [`Is ${t} worth it for ${a}?`, `Why does ${t} fail for beginners?`] },
  { category: "Contrarian", build: (t) => [`Stop doing ${t} — do this instead`, `Unpopular opinion: ${t} is overrated`] },
  { category: "Specific outcome", build: (t) => [`${t}: 5 steps, zero fluff`, `My exact ${t} checklist`] },
  { category: "Beginner-focused", build: (t) => [`${t} for absolute beginners`, `Start ${t} today (no experience needed)`] },
  { category: "Advanced-focused", build: (t) => [`Advanced ${t}: what the pros hide`, `Beyond basics: ${t} at scale`] },
];

/** Eight honest directions, two editable variants each. No ranking, no scores. */
export function generateTitleDirections(topic: string, audience: string): TitleDirection[] {
  const t = topic.trim() || "your topic";
  const a = audience.trim() || "beginners";
  return DIRECTIONS.map((d) => ({ category: d.category, variants: d.build(t, a) }));
}
