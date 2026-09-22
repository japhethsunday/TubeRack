/**
 * Hook development — Phase 5.
 * Real weak-opening detection over the creator's pasted opening lines plus
 * nine hook-type frameworks with starters. No performance predictions.
 */

export interface WeakOpening {
  pattern: string;
  label: string;
  suggestion: string;
}

const WEAK_PATTERNS: { label: string; test: RegExp; suggestion: string }[] = [
  { label: "Greeting filler", test: /^(hey|hi|hello|welcome back|thanks for (clicking|watching))\b/i, suggestion: "Start with the payoff, not the greeting — introduce yourself after the hook lands." },
  { label: "Meta announcement", test: /\b(in this video|in today'?s video|today i'?m (going to|gonna))\b/i, suggestion: "Show the thing instead of announcing the video. Cut straight to the most visual moment." },
  { label: "Apology / disclaimer", test: /\b(sorry|quick video|not an expert|bear with me)\b/i, suggestion: "Never open by lowering expectations. Confidence is the hook." },
  { label: "Throat-clearing", test: /^(so,?|um+|uh+|basically|alright,? so)\b/i, suggestion: "Delete the first sentence — the second one is usually the real opening." },
  { label: "Vague promise", test: /\b(this (video|one) is (going to be |gonna be )?(great|awesome|amazing|interesting))\b/i, suggestion: "Replace adjectives with the specific outcome or unknown." },
  { label: "Channel promo first", test: /\b(subscribe|smash (that|the) (like|subscribe)|notification bell)\b/i, suggestion: "Earn the subscribe with value first; ask after the first payoff." },
];

export interface HookFramework {
  type: string;
  reaction: string;
  whyItWorks: string;
  followWith: string;
  starter: string;
}

/** Scan the opening lines for weak patterns. Returns matches with fixes. */
export function detectWeakOpenings(text: string): WeakOpening[] {
  const opening = text.trim().split(/\s+/).slice(0, 40).join(" ");
  if (!opening) return [];
  return WEAK_PATTERNS.filter((p) => p.test.test(opening)).map((p) => ({
    pattern: p.label,
    label: p.label,
    suggestion: p.suggestion,
  }));
}

const FRAMEWORKS: (Omit<HookFramework, "starter"> & { starter: string })[] = [
  { type: "Curiosity", reaction: "“I need to know.”", whyItWorks: "An open information gap pulls the viewer forward.", followWith: "Delay the answer across the first act.", starter: "The strange reason {topic} fails" },
  { type: "Problem", reaction: "“That's me.”", whyItWorks: "Recognition converts instantly.", followWith: "Quantify the cost, then promise the fix.", starter: "If your {topic} keeps stalling, it's this" },
  { type: "Promise", reaction: "“I want that.”", whyItWorks: "A concrete outcome justifies the watch.", followWith: "Prove progress early and often.", starter: "Give me 8 minutes and I'll fix your {topic}" },
  { type: "Story", reaction: "“What happened?”", whyItWorks: "Narrative tension is structural retention.", followWith: "Withhold the turning point until mid-video.", starter: "Two years ago, {topic} humiliated me" },
  { type: "Question", reaction: "“Let me think…”", whyItWorks: "Questions recruit the viewer's brain.", followWith: "Answer in stages, not all at once.", starter: "Why does {topic} work for them but not you?" },
  { type: "Contrarian", reaction: "“Wait, what?”", whyItWorks: "Pattern interrupts stop thumbs.", followWith: "Defend the claim fast or lose trust.", starter: "Everything you know about {topic} is backwards" },
  { type: "Unexpected fact", reaction: "“No way.”", whyItWorks: "Surprise resets attention.", followWith: "Explain the mechanism behind the fact.", starter: "90% of {topic} advice ignores this number" },
  { type: "Demonstration", reaction: "“Show me.”", whyItWorks: "Proof beats promise.", followWith: "Narrate while doing, not before.", starter: "Watch me fix {topic} live" },
  { type: "Open loop", reaction: "“I'll stay for that.”", whyItWorks: "An unpaid promise holds viewers.", followWith: "Close every loop you open.", starter: "Stay for the ending — {topic} gets wild" },
];

export function hookFrameworks(topic: string): HookFramework[] {
  const t = topic.trim() || "your topic";
  return FRAMEWORKS.map((f) => ({ ...f, starter: f.starter.replaceAll("{topic}", t) }));
}

/** Classify a draft hook by its leading pattern. Transparent rules, shown in UI. */
export function classifyHook(text: string): string {
  const t = text.trim().toLowerCase();
  if (!t) return "Empty";
  if (t.endsWith("?") || t.startsWith("why") || t.startsWith("what") || t.startsWith("how") || t.startsWith("is ") || t.startsWith("are ") || t.startsWith("do ")) return "Question";
  if (/^\d/.test(t) || /\d+%|\d+x/i.test(t)) return "Unexpected fact";
  if (/\b(stop|never|don'?t|wrong|myth|lie)\b/.test(t)) return "Contrarian";
  if (/\b(i |my |when i|last (year|week|month)|years ago)\b/.test(t)) return "Story";
  if (/\b(learn|get|fix|build|give me|watch me|here'?s how)\b/.test(t)) return "Promise";
  if (/\b(but|however|although|while everyone)\b/.test(t)) return "Open loop";
  return "Curiosity";
}
