import type { PlatformId, RepurposeItem, RepurposeKind } from "@/src/lib/package/types";

/**
 * Platform packaging + repurposing — Phase 9.
 * Per-platform field schemas and adaptation rules are data, not assumptions:
 * editable presets the creator controls. Adapters deterministically reshape
 * source content; consistency flags catch drift without rewriting anything.
 */

export interface PlatformField {
  key: string;
  label: string;
  maxLength?: number;
  hint: string;
  required?: boolean;
}

export interface PlatformDef {
  id: PlatformId;
  label: string;
  blurb: string;
  aspect: string;
  fields: PlatformField[];
  hashtagLimit: number;
  captionTarget: string;
}

export const PLATFORMS: PlatformDef[] = [
  {
    id: "youtube",
    label: "YouTube",
    blurb: "Long-form: title, thumbnail, description, chapters, tags.",
    aspect: "16:9",
    hashtagLimit: 5,
    captionTarget: "Full description with chapters and links.",
    fields: [
      { key: "title", label: "Title", maxLength: 100, hint: "Front-load the payoff; ~60 chars display.", required: true },
      { key: "description", label: "Description", hint: "Promise, context, chapters, links, CTA." },
      { key: "tags", label: "Tags", hint: "Comma-separated; specific beats generic." },
      { key: "hashtags", label: "Hashtags", hint: "Up to 5; first 3 show above the title." },
      { key: "category", label: "Category", hint: "e.g. Education, Entertainment." },
      { key: "language", label: "Language", hint: "e.g. English." },
    ],
  },
  {
    id: "shorts",
    label: "YouTube Shorts",
    blurb: "Vertical cut-down with short title and hashtags.",
    aspect: "9:16",
    hashtagLimit: 5,
    captionTarget: "One-line hook + 3 hashtags.",
    fields: [
      { key: "title", label: "Short title", maxLength: 100, hint: "Punchy; pairs with the first frame.", required: true },
      { key: "description", label: "Description", hint: "One or two lines plus hashtags." },
      { key: "hashtags", label: "Hashtags", hint: "Include #Shorts where apt." },
      { key: "clipRange", label: "Clip range", hint: "Source timestamps, e.g. 0:45–1:12." },
    ],
  },
  {
    id: "tiktok",
    label: "TikTok",
    blurb: "Fast hook, concise caption, direct payoff.",
    aspect: "9:16",
    hashtagLimit: 5,
    captionTarget: "Under 150 characters, hook first.",
    fields: [
      { key: "caption", label: "Caption", maxLength: 2200, hint: "Hook in the first 40 characters." },
      { key: "hashtags", label: "Hashtags", hint: "3–5 targeted tags." },
      { key: "clipRange", label: "Clip range", hint: "Source timestamps." },
    ],
  },
  {
    id: "reels",
    label: "Instagram Reels",
    blurb: "Visual-first, shareable insight, concise caption.",
    aspect: "9:16",
    hashtagLimit: 8,
    captionTarget: "Insight + line breaks + CTA to share.",
    fields: [
      { key: "caption", label: "Caption", maxLength: 2200, hint: "Lead with the insight, not the context." },
      { key: "hashtags", label: "Hashtags", hint: "Up to 8; niche tags outperform broad ones." },
      { key: "clipRange", label: "Clip range", hint: "Source timestamps." },
    ],
  },
  {
    id: "x",
    label: "X",
    blurb: "Concise thought or thread with strong open.",
    aspect: "16:9",
    hashtagLimit: 2,
    captionTarget: "Under 280 characters per post; threads for depth.",
    fields: [
      { key: "post", label: "Post", maxLength: 280, hint: "One strong statement." },
      { key: "thread", label: "Thread (optional)", hint: "Numbered follow-ups, one per line." },
      { key: "hashtags", label: "Hashtags", hint: "0–2; more reads as spam." },
    ],
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    blurb: "Professional insight with structured takeaway.",
    aspect: "1:1",
    hashtagLimit: 5,
    captionTarget: "Hook + lesson + takeaway + question.",
    fields: [
      { key: "post", label: "Post", maxLength: 3000, hint: "Lesson first, context after." },
      { key: "hashtags", label: "Hashtags", hint: "3–5 professional tags." },
    ],
  },
  {
    id: "facebook",
    label: "Facebook",
    blurb: "Conversational caption with community CTA.",
    aspect: "16:9",
    hashtagLimit: 3,
    captionTarget: "Conversational + question to spark comments.",
    fields: [
      { key: "caption", label: "Caption", hint: "Conversational; end with a question." },
      { key: "hashtags", label: "Hashtags", hint: "Up to 3." },
    ],
  },
];

export function platformById(id: PlatformId): PlatformDef {
  return PLATFORMS.find((p) => p.id === id) ?? PLATFORMS[0];
}

export interface AdaptationRules {
  maxChars: number;
  hookFirst: boolean;
  hashtags: number;
  ctaStyle: string;
}

export const ADAPTATION_RULES: Record<PlatformId, AdaptationRules> = {
  youtube: { maxChars: 5000, hookFirst: false, hashtags: 5, ctaStyle: "Subscribe + next video" },
  shorts: { maxChars: 300, hookFirst: true, hashtags: 5, ctaStyle: "Follow for part 2" },
  tiktok: { maxChars: 150, hookFirst: true, hashtags: 5, ctaStyle: "Follow for more" },
  reels: { maxChars: 400, hookFirst: false, hashtags: 8, ctaStyle: "Share + save" },
  x: { maxChars: 280, hookFirst: true, hashtags: 2, ctaStyle: "Repost if useful" },
  linkedin: { maxChars: 1200, hookFirst: false, hashtags: 5, ctaStyle: "Comment your take" },
  facebook: { maxChars: 500, hookFirst: false, hashtags: 3, ctaStyle: "Tag someone" },
};

export interface Moment {
  id: string;
  source: string;
  text: string;
  kind: "hook" | "insight" | "fact" | "story" | "question" | "quote";
}

function sentencesOf(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+["”)]?\s*/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
}

/** Reusable moments: approved hooks, climax sections, statistic claims, questions. */
export function findMoments(input: {
  hooks: { id: string; text: string }[];
  sections: { id: string; type: string; heading: string; text: string }[];
  claims: { text: string; kind: string }[];
}): Moment[] {
  const moments: Moment[] = [];
  for (const h of input.hooks.slice(0, 3)) {
    moments.push({ id: `hook-${h.id}`, source: "Approved hook", text: h.text, kind: "hook" });
  }
  for (const s of input.sections.filter((x) => ["climax", "main-point", "example"].includes(x.type))) {
    const first = sentencesOf(s.text)[0];
    if (first && first.split(/\s+/).length >= 6) {
      moments.push({ id: `sec-${s.id}`, source: s.heading, text: first.slice(0, 220), kind: s.type === "climax" ? "insight" : "story" });
    }
  }
  for (const c of input.claims.filter((x) => x.kind === "statistic").slice(0, 3)) {
    moments.push({ id: `claim-${c.text.slice(0, 24)}`, source: "Script statistic", text: c.text.slice(0, 220), kind: "fact" });
  }
  const questions = input.sections
    .flatMap((s) => sentencesOf(s.text).map((t) => ({ s, t })))
    .filter((x) => x.t.trim().endsWith("?"))
    .slice(0, 2);
  for (const q of questions) {
    moments.push({ id: `q-${q.s.id}`, source: q.s.heading, text: q.t.slice(0, 220), kind: "question" });
  }
  return moments.slice(0, 10);
}

function truncateWords(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : maxChars - 1).trim()}…`;
}

/** Deterministic platform adaptation: reshape, never invent. */
export function adaptMoment(
  moment: Moment,
  kind: RepurposeKind,
  platform: PlatformId,
  opts: { cta: string; hashtags: string[] },
): { hook: string; body: string; cta: string } {
  const rules = ADAPTATION_RULES[platform];
  const tags = opts.hashtags.slice(0, rules.hashtags).map((h) => (h.startsWith("#") ? h : `#${h}`));
  const tagLine = tags.length > 0 ? `\n\n${tags.join(" ")}` : "";

  switch (kind) {
    case "x-post":
      return {
        hook: truncateWords(moment.text, 200),
        body: truncateWords(moment.text, rules.maxChars - tagLine.length - opts.cta.length - 8) + tagLine,
        cta: opts.cta || rules.ctaStyle,
      };
    case "x-thread":
      return {
        hook: truncateWords(moment.text, 200),
        body: `1/ ${truncateWords(moment.text, 200)}\n\n2/ Context in the full video — link below.${tagLine}`,
        cta: opts.cta || rules.ctaStyle,
      };
    case "linkedin-post":
      return {
        hook: moment.text,
        body: `${moment.text}\n\nWhat this means in practice: apply it once this week and measure the difference.${tagLine}\n\nWhat's worked for you?`,
        cta: opts.cta || rules.ctaStyle,
      };
    case "tiktok-script":
      return {
        hook: moment.text.split(/[.!?]/)[0].slice(0, 80),
        body: `HOOK (0-2s): ${moment.text.split(/[.!?]/)[0].slice(0, 120)}\nPAYOFF (2-20s): ${truncateWords(moment.text, 200)}\nCTA: ${opts.cta || rules.ctaStyle}${tagLine}`,
        cta: opts.cta || rules.ctaStyle,
      };
    case "quote":
      return {
        hook: moment.text,
        body: `“${truncateWords(moment.text, 140)}”${tagLine}`,
        cta: opts.cta || rules.ctaStyle,
      };
    case "carousel":
      return {
        hook: moment.text,
        body: `Slide 1 — Hook: ${truncateWords(moment.text, 120)}\nSlide 2 — Context\nSlide 3 — Proof\nSlide 4 — Takeaway\nSlide 5 — CTA: ${opts.cta || rules.ctaStyle}${tagLine}`,
        cta: opts.cta || rules.ctaStyle,
      };
    case "blog-outline":
      return {
        hook: moment.text,
        body: `H1: Working title\nH2: The problem\nH2: What I tested\nH2: Results\nH2: Takeaway\nCTA: ${opts.cta || rules.ctaStyle}`,
        cta: opts.cta || rules.ctaStyle,
      };
    case "newsletter":
      return {
        hook: moment.text,
        body: `This week: ${truncateWords(moment.text, 300)}\n\nWhy it matters, what to do Monday morning, one link to go deeper.${tagLine}`,
        cta: opts.cta || rules.ctaStyle,
      };
    default:
      return {
        hook: rules.hookFirst ? moment.text : moment.text,
        body: truncateWords(moment.text, rules.maxChars - tagLine.length - 4) + tagLine,
        cta: opts.cta || rules.ctaStyle,
      };
  }
}

export interface ConsistencyFlag {
  level: "issue" | "watch";
  note: string;
}

function figuresOf(text: string): string[] {
  return text.match(/\b\d+(\.\d+)?\s?(%|percent|x\b|times|million|billion|thousand)?\b/gi)?.map((s) => s.trim().toLowerCase()) ?? [];
}

/**
 * Cross-platform consistency: unsupported figures + avoid-words + new
 * promises. Flags for review — never rewrites.
 */
export function checkConsistency(output: Pick<RepurposeItem, "hook" | "body" | "cta">, source: string, avoidWords: string[]): ConsistencyFlag[] {
  const flags: ConsistencyFlag[] = [];
  const combined = `${output.hook} ${output.body} ${output.cta}`;
  const srcFigures = new Set(figuresOf(source));
  const outFigures = figuresOf(combined).filter((f) => !srcFigures.has(f));
  if (outFigures.length > 0) {
    flags.push({
      level: "issue",
      note: `Unsupported figure(s) not present in the source: ${[...new Set(outFigures)].slice(0, 3).join(", ")} — remove or verify before publishing.`,
    });
  }
  const lowered = combined.toLowerCase();
  for (const word of avoidWords.map((w) => w.trim().toLowerCase()).filter(Boolean)) {
    if (lowered.includes(word)) {
      flags.push({ level: "watch", note: `Contains brand avoid-term “${word}” — rephrase to match voice.` });
      break;
    }
  }
  const sourcePromises = /(guarantee|promise|will)/i.test(source);
  const outputPromises = /(guaranteed|will (double|triple|explode|go viral)|overnight)/i.test(combined);
  if (outputPromises && !sourcePromises) {
    flags.push({ level: "issue", note: "Introduces a promise the source never makes — new claims need sources, not adapters." });
  }
  return flags;
}
