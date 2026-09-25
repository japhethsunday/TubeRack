import type { TextOverlay, ThumbnailConcept } from "@/src/lib/package/types";

/**
 * Thumbnail concepts, composition, and quality review — Phase 9.
 * Concepts are deterministic archetypes slotted with project context.
 * Quality checks are real math (luminance contrast, scaled readability).
 * Language is always "potential issue", never performance promises.
 */

export interface ConceptInput {
  topic: string;
  title: string;
  audience: string;
  angle: string;
  tone: string;
  visualStyle: string;
  avoidStyles: string;
}

const ARCHETYPES: Omit<ThumbnailConcept, "id">[] = [
  {
    name: "Face + outcome",
    visual: "Close subject, expressive, large in frame",
    subject: "Creator reacting to the result",
    composition: "Subject right third, text left, negative space behind text",
    textDirection: "3 words max: the outcome, not the topic",
    emotion: "Surprise or relief",
    contrast: "Subject pops against a darker simplified background",
    background: "Blurred scene context, single hue",
    brandNotes: "Use brand accent for the outcome word only",
  },
  {
    name: "Split comparison",
    visual: "Before/after or A-vs-B halves",
    subject: "The two options side by side",
    composition: "Vertical split, arrow or VS marker center",
    textDirection: "One word per side",
    emotion: "Curiosity about the winner",
    contrast: "Warm vs cool halves",
    background: "Flat contrasting fields",
    brandNotes: "Keep brand font; color-code consistently across videos",
  },
  {
    name: "Single object",
    visual: "One hero object, oversized",
    subject: "The thing the video is about",
    composition: "Centered object, text top or bottom bar",
    textDirection: "Number or verdict (e.g. 3 MISTAKES)",
    emotion: "Recognition",
    contrast: "Object lit against flat backdrop",
    background: "Solid brand-adjacent color",
    brandNotes: "Object photography beats illustrations for this slot",
  },
  {
    name: "Question hook",
    visual: "Subject looking at the text",
    subject: "Creator + short question",
    composition: "Gaze leads the eye to 4-word question",
    textDirection: "The exact question viewers ask",
    emotion: "Unresolved curiosity",
    contrast: "High text-to-background separation",
    background: "Darkened scene still",
    brandNotes: "Question mark in brand accent",
  },
  {
    name: "Proof frame",
    visual: "Chart, result, or transformation",
    subject: "The evidence itself",
    composition: "Evidence fills 70% of frame, minimal text",
    textDirection: "The number, nothing else",
    emotion: "Disbelief that demands a click",
    contrast: "Number in brightest element",
    background: "Clean, uncluttered",
    brandNotes: "Numbers must match the video's real figures",
  },
  {
    name: "Minimal bold",
    visual: "Two colors, one idea",
    subject: "Typography as the visual",
    composition: "Huge word, tiny support line",
    textDirection: "One powerful word",
    emotion: "Confidence",
    contrast: "Maximum: near-black on near-white or inverse",
    background: "Flat, no photo",
    brandNotes: "Best for established channels with recognition",
  },
];

export function buildConcepts(input: ConceptInput): ThumbnailConcept[] {
  const topic = input.topic.trim() || "your topic";
  return ARCHETYPES.map((a, i) => ({
    ...a,
    id: `concept_${i}`,
    visual: `${a.visual} — featuring ${topic}`,
    subject: input.audience.trim() ? `${a.subject} (for ${input.audience.trim()})` : a.subject,
    brandNotes: [
      a.brandNotes,
      input.tone.trim() ? `Tone: ${input.tone.trim()}` : "",
      input.avoidStyles.trim() ? `Avoid: ${input.avoidStyles.trim()}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
  }));
}

export const THUMBNAIL_METHOD =
  "Local concept assembly (no AI provider). Archetypes are fixed professional patterns; your topic, title, " +
  "audience, and DNA fill them in. Image generation for concepts connects in Phase 11.";

/* ---------------- SVG composition (exportable, self-contained) ---------------- */

/** Solid gradient starter base for variants without generated art. */
export function solidBase(from: string, to: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><defs><linearGradient id="base" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="1280" height="720" fill="url(#base)"/></svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Compose base SVG + text overlays into one standalone 1280×720 SVG.
 * The base nests as a child <svg>; overlays become real <text> elements,
 * so downloads carry the design — not a screenshot of the editor.
 */
export function composeThumbnail(baseSvg: string, overlays: TextOverlay[]): string {
  const W = 1280;
  const H = 720;
  // Re-open the base's root <svg> with exactly one set of size/position
  // attributes (duplicates make the file invalid outside an HTML page).
  const nested = baseSvg.replace(/<svg\b([^>]*)>/, (_m, attrs: string) => {
    const kept = attrs.replace(/\s(?:width|height|x|y|preserveAspectRatio)="[^"]*"/g, "");
    return `<svg${kept} x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice">`;
  });
  const texts = overlays
    .map((o) => {
      const x = Math.round((o.x / 100) * W);
      const y = Math.round((o.y / 100) * H);
      const anchor = o.align === "center" ? "middle" : o.align === "right" ? "end" : "start";
      return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="system-ui, sans-serif" font-size="${o.size}" font-weight="${o.weight}" fill="${o.color}" stroke="rgba(0,0,0,0.65)" stroke-width="${Math.max(1, Math.round(o.size / 14))}" paint-order="stroke">${escapeXml(o.text)}</text>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Thumbnail design">${nested}${texts}</svg>`;
}

/* ---------------- Quality review (real checks, humble language) ---------------- */

export interface QualityFlag {
  check: string;
  level: "issue" | "watch" | "pass";
  note: string;
}

function luminance(hex: string): number {
  const m = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return 0.5;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const rgb = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

export function contrastRatio(foreground: string, background: string): number {
  const l1 = luminance(foreground);
  const l2 = luminance(background);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

const STOP_TOPICS = new Set(["the", "a", "an", "and", "or", "vs", "with", "your", "you"]);

export function reviewThumbnail(overlays: TextOverlay[]): { flags: QualityFlag[]; summary: string } {
  const flags: QualityFlag[] = [];
  const words = overlays.flatMap((o) => o.text.split(/\s+/).filter(Boolean));

  flags.push({
    check: "Text volume",
    level: words.length === 0 ? "watch" : words.length <= 5 ? "pass" : words.length <= 8 ? "watch" : "issue",
    note:
      words.length === 0
        ? "No text — fine for proof frames, risky otherwise."
        : words.length <= 5
          ? `${words.length} word(s). Thumbnail text stays scannable.`
          : `${words.length} words — feed readers skim; cut to the outcome.`,
  });

  for (const o of overlays) {
    // At 120px feed width, size scales by 120/1280.
    const feedPx = (o.size * 120) / 1280;
    if (feedPx < 10) {
      flags.push({
        check: "Readability",
        level: "issue",
        note: `“${o.text.slice(0, 24)}” renders ~${feedPx.toFixed(0)}px tall in feeds — likely unreadable. Enlarge or cut.`,
      });
    }
    const ratio = contrastRatio(o.color, "#101014");
    if (ratio < 3) {
      flags.push({
        check: "Contrast",
        level: "issue",
        note: `“${o.text.slice(0, 24)}” vs dark imagery is ${ratio.toFixed(1)}:1 — below the 3:1 floor for large text. Lighten the text or darken behind it.`,
      });
    }
  }

  if (overlays.length > 4) {
    flags.push({
      check: "Clutter",
      level: "issue",
      note: `${overlays.length} text layers compete. One idea per thumbnail.`,
    });
  }

  const hierarchy =
    overlays.length >= 2
      ? Math.max(...overlays.map((o) => o.size)) / Math.min(...overlays.map((o) => o.size))
      : 1;
  flags.push({
    check: "Hierarchy",
    level: overlays.length < 2 ? "pass" : hierarchy >= 1.4 ? "pass" : "watch",
    note:
      overlays.length < 2
        ? "Single layer — hierarchy is automatic."
        : hierarchy >= 1.4
          ? "Clear size difference between primary and support text."
          : "Layers are similarly sized — make one dominant.",
  });

  if (flags.every((f) => f.level === "pass")) {
    flags.push({ check: "Overall", level: "pass", note: "No structural issues detected. Small-size preview below is the real test." });
  }

  return {
    flags,
    summary: `${flags.filter((f) => f.level === "issue").length} potential issue(s), ${flags.filter((f) => f.level === "watch").length} watch item(s). Structural guidance only — never a click prediction.`,
  };
}

export interface PairingNote {
  verdict: "complement" | "repeat" | "drift";
  note: string;
}

/** Title + thumbnail pairing: promise alignment without CTR claims. */
export function reviewPairing(title: string, overlayText: string): PairingNote[] {
  const notes: PairingNote[] = [];
  const significant = (s: string) =>
    s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP_TOPICS.has(w));
  const titleWords = new Set(significant(title));
  const thumbWords = significant(overlayText);
  const overlap = thumbWords.filter((w) => titleWords.has(w));

  if (thumbWords.length === 0) {
    notes.push({ verdict: "complement", note: "Text-free thumbnail lets the title carry the promise — ensure the visual adds curiosity on its own." });
  } else if (overlap.length >= 2) {
    notes.push({ verdict: "repeat", note: `Title and thumbnail both say “${overlap.slice(0, 3).join(", ")}” — use the image to add, not repeat. Swap in the outcome or the contrast.` });
  } else if (overlap.length === 1) {
    notes.push({ verdict: "complement", note: `One shared word (“${overlap[0]}”) anchors topic while the rest differentiates — a healthy split.` });
  } else {
    notes.push({ verdict: "drift", note: "No shared terms — verify both promise the same video, or viewers feel misled at the payoff." });
  }

  const question = title.trim().endsWith("?") || overlayText.trim().endsWith("?");
  if (question) {
    notes.push({ verdict: "complement", note: "A question is present — the video must answer it early or retention pays the price." });
  }
  return notes;
}
