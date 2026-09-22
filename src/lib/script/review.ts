import type { ScriptSection } from "@/src/lib/script/types";
import { countWords, splitSentences } from "@/src/lib/script/measure";
import { detectWeakOpenings } from "@/src/lib/intelligence/hooks";
import { detectClaims } from "@/src/lib/script/claims";
import { extractTrigrams, TRANSITION_PHRASES } from "@/src/lib/intelligence/retention";

/**
 * Section-level review: real local checks producing specific, dismissible
 * suggestions. Never rewrites; never invents. Dismissal is UI state.
 */

export type SuggestionKind =
  | "empty"
  | "hook"
  | "length"
  | "repetition"
  | "transition"
  | "claims"
  | "density";

export interface SectionSuggestion {
  sectionId: string;
  heading: string;
  kind: SuggestionKind;
  message: string;
  detail: string;
}

export function reviewSections(sections: ScriptSection[]): SectionSuggestion[] {
  const out: SectionSuggestion[] = [];
  const push = (sectionId: string, heading: string, kind: SuggestionKind, message: string, detail: string) =>
    out.push({ sectionId, heading, kind, message, detail });

  for (const s of sections) {
    const words = countWords(s.text);
    if (words === 0) {
      push(s.id, s.heading, "empty", "Empty section.", "Write it, or delete it — empty beats stall the timeline.");
      continue;
    }
    if (s.type === "hook") {
      const weak = detectWeakOpenings(s.text);
      for (const w of weak) {
        push(s.id, s.heading, "hook", `Weak opening: ${w.label.toLowerCase()}.`, w.suggestion);
      }
    }
    if (words > 300) {
      push(s.id, s.heading, "length", `Long section (~${words} words).`, "Consider splitting at a natural breath — overloaded beats lose viewers.");
    }
    const sentences = splitSentences(s.text);
    if (sentences.length >= 3) {
      const avg = words / sentences.length;
      if (avg > 28) {
        push(s.id, s.heading, "density", "Dense sentences.", "Break long sentences — spoken copy lands under ~20 words per sentence.");
      }
    }
    const claims = detectClaims(s.text).filter((c) => c.kind !== "opinion");
    if (claims.length > 0) {
      push(
        s.id,
        s.heading,
        "claims",
        `${claims.length} checkable claim(s) — all unverified.`,
        "Attach research references; verification tooling arrives in Phase 11. Never ship these as facts without sources.",
      );
    }
  }

  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      const a = extractTrigrams(sections[i].text);
      const b = extractTrigrams(sections[j].text);
      let shared = 0;
      for (const t of a) if (b.has(t)) shared += 1;
      if (shared >= 5) {
        push(
          sections[j].id,
          sections[j].heading,
          "repetition",
          `Repeats “${sections[i].heading}”.`,
          `${shared} shared phrases — the same point appears earlier. Cut, merge, or differentiate.`,
        );
        break;
      }
    }
  }

  for (let i = 1; i < sections.length; i++) {
    const s = sections[i];
    if (countWords(s.text) === 0) continue;
    const prev = sections[i - 1].text.toLowerCase();
    const cur = s.text.toLowerCase().slice(0, 200);
    const bridged = TRANSITION_PHRASES.some((t) => cur.includes(t) || prev.slice(-200).includes(t));
    if (!bridged && countWords(s.text) > 60) {
      push(s.id, s.heading, "transition", "Possibly abrupt entry.", "Bridge from the previous beat so progression feels inevitable.");
    }
  }

  return out;
}
