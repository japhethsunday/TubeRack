/**
 * Content-gap analysis — Phase 5.
 * Compares the creator's REAL local catalog + user-entered references against
 * a topic. Outputs prompts and uncovered-angle observations only.
 * Competitors, volumes, and rankings are never fabricated.
 */

export interface CatalogEntry {
  name: string;
  topic: string;
}

export interface CompetitorReference {
  title: string;
  angle: string;
  depth: "shallow" | "solid" | "deep";
}

export interface ContentGap {
  kind: "unanswered" | "uncovered-angle" | "missing-comparison" | "weak-beginner" | "fresh-perspective";
  title: string;
  detail: string;
}

const ANGLE_KEYWORDS: { angle: string; keywords: string[] }[] = [
  { angle: "Tutorial", keywords: ["tutorial", "how to", "setup", "step"] },
  { angle: "Case study", keywords: ["case study", "tested", "experiment", "30 days"] },
  { angle: "Comparison", keywords: [" vs ", "versus", "compared", "best "] },
  { angle: "Story", keywords: ["story", "journey", "how i", "mistake"] },
  { angle: "Contrarian", keywords: ["stop", "myth", "wrong", "overrated"] },
  { angle: "Beginner guide", keywords: ["beginner", "start", "basics", "101"] },
];

export function findGaps(input: {
  topic: string;
  catalog: CatalogEntry[];
  references: CompetitorReference[];
}): { gaps: ContentGap[]; summary: string } {
  const gaps: ContentGap[] = [];
  const topic = input.topic.trim();
  const catalogText = input.catalog.map((c) => `${c.name} ${c.topic}`.toLowerCase()).join("\n");

  const questions = (topic.match(/[^.!?]*\?/g) ?? []).map((s) => s.trim()).filter(Boolean);
  for (const q of questions.slice(0, 3)) {
    gaps.push({
      kind: "unanswered",
      title: `Answer directly: “${q}”`,
      detail: "The topic asks this outright — a video that answers it in the title wins the click honestly.",
    });
  }

  const hasComparisonRef = input.references.some((r) => r.angle.toLowerCase().includes("compar"));
  if (!hasComparisonRef && input.references.length > 0) {
    gaps.push({
      kind: "missing-comparison",
      title: "No head-to-head among references",
      detail: "The entered references don't compare approaches directly — a comparison video would fill that slot.",
    });
  }

  const shallowBeginner = input.references.filter(
    (r) => r.depth === "shallow" && /beginner|start|basic|intro/i.test(`${r.title} ${r.angle}`),
  );
  if (shallowBeginner.length > 0) {
    gaps.push({
      kind: "weak-beginner",
      title: "Weak beginner coverage nearby",
      detail: `“${shallowBeginner[0].title}” covers beginners shallowly — a definitive beginner resource could out-teach it.`,
    });
  }

  for (const { angle, keywords } of ANGLE_KEYWORDS) {
    if (gaps.length >= 6) break;
    const covered = keywords.some((k) => catalogText.includes(k));
    if (!covered) {
      gaps.push({
        kind: "uncovered-angle",
        title: `No ${angle.toLowerCase()} in your catalog`,
        detail: `None of your ${input.catalog.length} local project(s) match this angle. A ${angle.toLowerCase()} on “${topic || "this topic"}” would be new for your audience.`,
      });
    }
  }

  if (input.references.length === 0) {
    gaps.push({
      kind: "fresh-perspective",
      title: "No references entered",
      detail: "Add 2–3 competing videos (title + angle + depth) to compare coverage honestly. Nothing is assumed until you do.",
    });
  }

  return {
    gaps: gaps.slice(0, 7),
    summary:
      input.catalog.length === 0 && input.references.length === 0
        ? "Nothing to compare yet — create a project or add references to surface real gaps."
        : `${gaps.length} gap prompt(s) from ${input.catalog.length} local project(s) and ${input.references.length} reference(s). Prompts, not findings.`,
  };
}
