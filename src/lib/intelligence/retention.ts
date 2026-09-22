/**
 * Retention review — Phase 5.
 * Structural checks over a creator-pasted outline. Reports potential risks
 * with “potential risk / likely friction / opportunity” language and a
 * disclosed method. Never predicts viewer retention.
 */

export interface OutlineSection {
  heading: string;
  body: string;
}

export interface RetentionFlag {
  area: string;
  level: "risk" | "friction" | "opportunity";
  note: string;
  suggestion: string;
}

export const RETENTION_METHODOLOGY =
  "Local structural review (no AI, no watch data). Word counts estimate pacing at ~150 spoken words per minute; " +
  "repetition is measured by shared 3-word phrases between sections; transitions by explicit connective phrases. " +
  "Flags are risks to inspect, not predictions.";

export const TRANSITION_PHRASES = ["but first", "here's why", "that means", "so what", "next", "meanwhile", "in contrast", "because of that", "which is why", "turns out"];
const PAYOFF_WORDS = ["result", "payoff", "answer", "reveal", "outcome", "verdict", "checklist", "template", "fix", "solution"];

function words(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export function extractTrigrams(s: string): Set<string> {
  const w = s.toLowerCase().split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + 2 < w.length; i++) out.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`);
  return out;
}

export function analyzeRetention(sections: OutlineSection[]): { flags: RetentionFlag[]; estimateMinutes: number; summary: string } {
  const flags: RetentionFlag[] = [];
  const totalWords = sections.reduce((n, s) => n + words(s.heading) + words(s.body), 0);
  const estimateMinutes = Math.max(1, Math.round(totalWords / 150));

  if (sections.length === 0) {
    return { flags: [], estimateMinutes: 0, summary: "Paste an outline — one section per beat — to review its structure." };
  }

  const first = sections[0];
  const firstWords = words(first.heading) + words(first.body);
  if (firstWords > 150) {
    flags.push({
      area: "Opening",
      level: "risk",
      note: `Setup runs ~${firstWords} words before the video earns attention.`,
      suggestion: "Cut the opening to one payoff sentence, then introduce yourself after it lands.",
    });
  }

  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      const a = extractTrigrams(`${sections[i].heading} ${sections[i].body}`);
      const b = extractTrigrams(`${sections[j].heading} ${sections[j].body}`);
      let shared = 0;
      for (const t of a) if (b.has(t)) shared += 1;
      if (shared >= 4) {
        flags.push({
          area: `Sections ${i + 1} & ${j + 1}`,
          level: "friction",
          note: `Likely repetition: ${shared} shared phrases between “${sections[i].heading}” and “${sections[j].heading}”.`,
          suggestion: "Merge the beats or give each a distinct job — setup, proof, or payoff.",
        });
        break;
      }
    }
  }

  const transitionCount = sections.reduce(
    (n, s) => n + TRANSITION_PHRASES.filter((t) => s.body.toLowerCase().includes(t)).length,
    0,
  );
  if (sections.length > 2 && transitionCount < sections.length - 1) {
    flags.push({
      area: "Transitions",
      level: "friction",
      note: `Only ${transitionCount} explicit transition(s) across ${sections.length} sections.`,
      suggestion: "Bridge every beat (“which is why…”, “but first…”) so progression feels inevitable.",
    });
  }

  const last = sections[sections.length - 1];
  const lastText = `${last.heading} ${last.body}`.toLowerCase();
  if (!PAYOFF_WORDS.some((w) => lastText.includes(w))) {
    flags.push({
      area: "Payoff",
      level: "risk",
      note: "The closing beat names no clear payoff.",
      suggestion: "End with the result, answer, or checklist the title promised.",
    });
  }

  const heavy = sections.findIndex((s) => words(s.body) > 300);
  if (heavy >= 0) {
    flags.push({
      area: `Section ${heavy + 1}`,
      level: "friction",
      note: `~${words(sections[heavy].body)} words without a break — likely information overload.`,
      suggestion: "Split it with a pattern interrupt: example, demo, or open loop.",
    });
  }

  if (flags.length === 0) {
    flags.push({
      area: "Structure",
      level: "opportunity",
      note: "No structural risks detected by these checks.",
      suggestion: "Pressure-test the opening out loud — if it takes two breaths, cut it in half.",
    });
  }

  return {
    flags,
    estimateMinutes,
    summary: `~${estimateMinutes} minute(s) spoken across ${sections.length} beat(s), ${flags.length} structural note(s). Risks are to inspect, not predictions.`,
  };
}
