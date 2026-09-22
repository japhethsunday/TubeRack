import type { SectionType } from "@/src/lib/script/types";

/**
 * Script format registry — extensible. Each format maps to an ordered
 * section template; "Custom" starts empty. New formats add entries here
 * without touching the editor.
 */

export interface FormatDef {
  name: string;
  blurb: string;
  sections: { type: SectionType; heading: string; guidance: string }[];
}

const STANDARD: FormatDef["sections"] = [
  { type: "hook", heading: "Hook", guidance: "Payoff first — earn the next 30 seconds." },
  { type: "introduction", heading: "Introduction", guidance: "Who you are and why this matters, briefly." },
  { type: "setup", heading: "Setup", guidance: "Stakes, promise, and roadmap." },
  { type: "main-point", heading: "Main point 1", guidance: "First beat: claim, proof, example." },
  { type: "main-point", heading: "Main point 2", guidance: "Second beat with escalation." },
  { type: "main-point", heading: "Main point 3", guidance: "Strongest beat before the payoff." },
  { type: "example", heading: "Example", guidance: "Concrete proof the viewer can picture." },
  { type: "transition", heading: "Transition", guidance: "Bridge into the key insight." },
  { type: "climax", heading: "Key insight", guidance: "The payoff the title promised." },
  { type: "conclusion", heading: "Conclusion", guidance: "Recap in one breath." },
  { type: "cta", heading: "CTA", guidance: "One ask plus the next video." },
];

export const SCRIPT_FORMATS: FormatDef[] = [
  { name: "YouTube long-form", blurb: "8–15 min standard structure.", sections: STANDARD },
  { name: "Short-form", blurb: "Under 60 seconds.", sections: [
    { type: "hook", heading: "Hook", guidance: "First 2 seconds decide everything." },
    { type: "main-point", heading: "The point", guidance: "One idea, no setup." },
    { type: "cta", heading: "CTA", guidance: "Follow for part 2 or the full video." },
  ] },
  { name: "Tutorial", blurb: "Follow-along steps.", sections: [
    { type: "hook", heading: "Hook", guidance: "The result they'll get." },
    { type: "setup", heading: "Prerequisites", guidance: "What they need before starting." },
    { type: "main-point", heading: "Step 1", guidance: "Action + expected result." },
    { type: "main-point", heading: "Step 2", guidance: "Action + expected result." },
    { type: "main-point", heading: "Step 3", guidance: "Action + expected result." },
    { type: "example", heading: "Troubleshooting", guidance: "Where it breaks and the fix." },
    { type: "conclusion", heading: "Recap", guidance: "Checklist of what they did." },
    { type: "cta", heading: "CTA", guidance: "Next tutorial or template." },
  ] },
  { name: "Educational", blurb: "Concept-first teaching.", sections: STANDARD },
  { name: "Documentary", blurb: "Evidence-led narrative.", sections: [
    { type: "hook", heading: "Cold open", guidance: "Most striking moment, unexplained." },
    { type: "introduction", heading: "Context", guidance: "Where and when, briefly." },
    { type: "setup", heading: "Question", guidance: "The mystery this film answers." },
    { type: "main-point", heading: "Evidence 1", guidance: "First source or finding." },
    { type: "main-point", heading: "Evidence 2", guidance: "Complication or counter-evidence." },
    { type: "climax", heading: "Answer", guidance: "What the evidence means." },
    { type: "conclusion", heading: "Coda", guidance: "What remains open." },
  ] },
  { name: "Explainer", blurb: "One concept, clearly.", sections: [
    { type: "hook", heading: "Hook", guidance: "The confusion this resolves." },
    { type: "introduction", heading: "Definition", guidance: "Plain-language definition." },
    { type: "main-point", heading: "How it works", guidance: "Mechanism in steps." },
    { type: "example", heading: "Example", guidance: "Concrete instance." },
    { type: "conclusion", heading: "Takeaway", guidance: "One sentence to remember." },
  ] },
  { name: "Commentary", blurb: "React and add perspective.", sections: [
    { type: "hook", heading: "Hook", guidance: "Your take in one line." },
    { type: "setup", heading: "Context", guidance: "What you're responding to." },
    { type: "main-point", heading: "Point 1", guidance: "Agree, extend, or rebut." },
    { type: "main-point", heading: "Point 2", guidance: "Second angle." },
    { type: "conclusion", heading: "Verdict", guidance: "Where you land." },
  ] },
  { name: "Review", blurb: "Verdict-driven evaluation.", sections: [
    { type: "hook", heading: "Hook", guidance: "Verdict up front." },
    { type: "setup", heading: "What it is", guidance: "Price, context, who it's for." },
    { type: "main-point", heading: "Strengths", guidance: "Tested, specific." },
    { type: "main-point", heading: "Weaknesses", guidance: "Honest costs." },
    { type: "example", heading: "Comparisons", guidance: "Versus the alternatives." },
    { type: "conclusion", heading: "Verdict", guidance: "Who should buy, who shouldn't." },
  ] },
  { name: "Case study", blurb: "One example, deep.", sections: [
    { type: "hook", heading: "Hook", guidance: "The surprising result." },
    { type: "setup", heading: "Background", guidance: "Starting point and method." },
    { type: "main-point", heading: "What happened", guidance: "Timeline of events." },
    { type: "example", heading: "Numbers", guidance: "Data with sources." },
    { type: "climax", heading: "Lesson", guidance: "Transferable principle." },
    { type: "cta", heading: "CTA", guidance: "Apply it / next case." },
  ] },
  { name: "Story-driven", blurb: "Narrative arc.", sections: [
    { type: "hook", heading: "Hook", guidance: "Start mid-action." },
    { type: "setup", heading: "World", guidance: "Who, where, want." },
    { type: "main-point", heading: "Rising action", guidance: "Complications." },
    { type: "climax", heading: "Turning point", guidance: "Everything changes." },
    { type: "conclusion", heading: "Resolution", guidance: "New normal + meaning." },
  ] },
  { name: "List format", blurb: "Ranked or grouped points.", sections: [
    { type: "hook", heading: "Hook", guidance: "Best item teased." },
    { type: "setup", heading: "Criteria", guidance: "How the list was built." },
    { type: "main-point", heading: "Item 1", guidance: "Point + why it ranks." },
    { type: "main-point", heading: "Item 2", guidance: "Point + why it ranks." },
    { type: "main-point", heading: "Item 3", guidance: "Point + why it ranks." },
    { type: "conclusion", heading: "Winner", guidance: "Top pick + runner-up." },
  ] },
  { name: "Interview-style", blurb: "Conversation-led.", sections: [
    { type: "hook", heading: "Hook", guidance: "Best quote first." },
    { type: "introduction", heading: "Guest intro", guidance: "Why this guest matters." },
    { type: "main-point", heading: "Question 1", guidance: "Core question + follow-ups." },
    { type: "main-point", heading: "Question 2", guidance: "Challenge or depth." },
    { type: "main-point", heading: "Question 3", guidance: "Forward-looking close." },
    { type: "conclusion", heading: "Outro", guidance: "Thanks + where to find them." },
  ] },
  { name: "Promotional", blurb: "Launch or offer.", sections: [
    { type: "hook", heading: "Hook", guidance: "Problem agitation." },
    { type: "setup", heading: "Offer", guidance: "What it is and who it's for." },
    { type: "main-point", heading: "Proof", guidance: "Results and testimonials." },
    { type: "climax", heading: "Deal", guidance: "Terms, scarcity, guarantee." },
    { type: "cta", heading: "CTA", guidance: "Single action, repeated." },
  ] },
  { name: "Custom", blurb: "Blank structure — add your own sections.", sections: [] },
];

export function formatNames(): string[] {
  return SCRIPT_FORMATS.map((f) => f.name);
}

export function formatDef(name: string): FormatDef {
  return SCRIPT_FORMATS.find((f) => f.name === name) ?? SCRIPT_FORMATS[SCRIPT_FORMATS.length - 1];
}

export const TONES = [
  "Educational",
  "Conversational",
  "Professional",
  "Energetic",
  "Story-driven",
  "Serious",
  "Humorous",
  "Custom",
] as const;

export const COMPLEXITIES = ["Beginner", "Intermediate", "Advanced"] as const;

export const STRUCTURES = ["Standard", "Story-driven", "Tutorial", "Documentary", "Custom"] as const;

export const LENGTH_TARGETS: { label: string; words: number }[] = [
  { label: "Short (~2 min)", words: 300 },
  { label: "Medium (~6 min)", words: 900 },
  { label: "Long (~12 min)", words: 1800 },
  { label: "Custom", words: 0 },
];
