import type { Claim, ClaimKind, ResearchRef, ScriptSection, SectionType } from "@/src/lib/script/types";

/**
 * Claim + research-reference foundation. Detection is pattern-based and
 * transparent; EVERYTHING stays unverified until Phase 11 tooling.
 * Never present a claim as verified.
 */

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

/** For tests: deterministic ids. */
export function __resetScriptIds(): void {
  seq = 0;
}

export function newSectionId(): string {
  return nextId("sec");
}

export function blankSection(type: SectionType, heading: string, at?: string): ScriptSection {
  const stamp = at ?? new Date().toISOString();
  return {
    id: nextId("sec"),
    type,
    heading,
    text: "",
    aiGenerated: false,
    edited: false,
    sceneIds: [],
    retentionNotes: [],
    researchRefs: [],
    creatorNotes: "",
    updatedAt: stamp,
  };
}

const PATTERNS: { kind: ClaimKind; test: RegExp }[] = [
  { kind: "statistic", test: /\b\d+(\.\d+)?\s?(%|percent|x\b|times|million|billion|thousand)\b/i },
  { kind: "statistic", test: /\b\d{2,}\b/ },
  { kind: "date", test: /\b(19|20)\d{2}\b|\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i },
  { kind: "quote", test: /["“][^"”]{4,}["”]/ },
  { kind: "technical", test: /\b(algorithm|api|retention|ctr|codec|bitrate|fps|resolution|metadata)\b/i },
  { kind: "name", test: /\b([A-Z][a-z]+ [A-Z][a-z]+)\b/ },
  { kind: "factual", test: /\b(study|research|report|survey|found|proved|causes?|always|never|everyone|nobody)\b/i },
];

/** Detect potentially important claims in a section. All start unverified. */
export function detectClaims(text: string): Claim[] {
  const sentences = text.match(/[^.!?]+[.!?]+["”)]?\s*/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
  const claims: Claim[] = [];
  const seen = new Set<string>();
  for (const sentence of sentences) {
    for (const { kind, test } of PATTERNS) {
      if (kind === "opinion") continue;
      if (test.test(sentence) && !seen.has(sentence + kind)) {
        seen.add(sentence + kind);
        claims.push({ id: nextId("cl"), text: sentence.slice(0, 160), kind, verified: false });
      }
    }
  }
  if (/\b(i think|in my opinion|personally|to me)\b/i.test(text)) {
    claims.push({ id: nextId("cl"), text: "Contains first-person opinion framing.", kind: "opinion", verified: false });
  }
  return claims;
}

export function addResearchRef(
  section: ScriptSection,
  fact: string,
  source: string,
  at?: string,
): ScriptSection {
  const clean = fact.trim();
  if (!clean) throw new Error("Fact cannot be empty.");
  const ref: ResearchRef = {
    id: nextId("ref"),
    fact: clean,
    source: source.trim() || "Unlabeled source",
    verified: false,
  };
  return { ...section, researchRefs: [...section.researchRefs, ref], updatedAt: at ?? new Date().toISOString() };
}

export function removeResearchRef(section: ScriptSection, refId: string, at?: string): ScriptSection {
  return {
    ...section,
    researchRefs: section.researchRefs.filter((r) => r.id !== refId),
    updatedAt: at ?? new Date().toISOString(),
  };
}
