import type {
  LoopItem,
  Scene,
  Script,
  ScriptSection,
  ScriptVersion,
  SectionType,
} from "@/src/lib/script/types";
import { blankSection, newSectionId } from "@/src/lib/script/claims";
import { countWords, estimateSeconds } from "@/src/lib/script/measure";
import { formatDef } from "@/src/lib/script/formats";

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

function stamp(at?: string): string {
  return at ?? new Date().toISOString();
}

export interface AssemblyInput {
  format: string;
  tone: string;
  complexity: string;
  structure: string;
  targetWords: number;
  instruction: string;
  topic: string;
  audience: string;
  hookText: string;
  promiseText: string;
  takeawayText: string;
  points: string[];
  ctaText: string;
}

export const ASSEMBLY_METHOD =
  "Local template assembly (no AI provider). Approved hooks, titles, strategy, and audience are slotted into the " +
  "chosen format's structure as labeled starter text for the creator to rewrite. Nothing here is finished copy.";

/**
 * Deterministic script assembly from intelligence context. Produces STARTED
 * sections flagged aiGenerated with an explicit note — the creator rewrites
 * everything that matters.
 */
export function assembleScript(input: AssemblyInput, at?: string): ScriptSection[] {
  const def = formatDef(input.format);
  const now = stamp(at);
  const perSection = Math.max(40, Math.round(input.targetWords / Math.max(1, def.sections.length)));
  return def.sections.map((s) => {
    const base = blankSection(s.type, s.heading, now);
    return {
      ...base,
      text: starterFor(s.type, input, perSection),
      aiGenerated: true,
      aiNote: `Local assembly from intelligence context (${input.tone}, ${input.complexity}). Rewrite before producing.`,
    };
  });
}

function starterFor(type: SectionType, input: AssemblyInput, perSection: number): string {
  const topic = input.topic || "this topic";
  const audience = input.audience || "the viewer";
  const extra = input.instruction.trim() ? ` Creator note: ${input.instruction.trim()}` : "";
  switch (type) {
    case "hook":
      return input.hookText || `[HOOK — expand to ~${perSection} words] Open on the payoff for ${audience}: ${topic}.${extra}`;
    case "introduction":
      return `[INTRO] Who you are, why ${topic} matters to ${audience}.${extra}`;
    case "setup":
      return `[SETUP] Stakes, promise${input.promiseText ? `: ${input.promiseText}` : ""}, and roadmap.${extra}`;
    case "main-point":
      return `[BEAT — ~${perSection} words] Claim, proof, example. ${input.points.length > 0 ? `Candidate point: ${input.points[0]}` : ""}${extra}`;
    case "example":
      return `[EXAMPLE] Concrete proof ${audience} can picture.${extra}`;
    case "transition":
      return `[TRANSITION] Bridge: "which is why…"${extra}`;
    case "climax":
      return `[KEY INSIGHT${input.takeawayText ? `: ${input.takeawayText}` : ""}] The payoff the title promised.${extra}`;
    case "conclusion":
      return `[RECAP] One-breath summary.${extra}`;
    case "cta":
      return `[CTA] ${input.ctaText || "One ask plus the next video."}${extra}`;
    default:
      return `[${type.toUpperCase()} — ~${perSection} words]${extra}`;
  }
}

/* ---------------- Section operations (all pure, all safe) ---------------- */

export function addSection(
  sections: ScriptSection[],
  type: SectionType,
  heading: string,
  index?: number,
  at?: string,
): ScriptSection[] {
  const next = [...sections];
  next.splice(index ?? next.length, 0, blankSection(type, heading || "Untitled", at));
  return next;
}

export function duplicateSection(sections: ScriptSection[], id: string, at?: string): ScriptSection[] {
  const now = stamp(at);
  return sections.flatMap((s) =>
    s.id === id
      ? [s, { ...s, id: newSectionId(), heading: `${s.heading} (copy)`, aiGenerated: false, edited: true, sceneIds: [], updatedAt: now }]
      : [s],
  );
}

export function deleteSection(sections: ScriptSection[], id: string): ScriptSection[] {
  return sections.filter((s) => s.id !== id);
}

export function moveSection(sections: ScriptSection[], id: string, dir: -1 | 1): ScriptSection[] {
  const i = sections.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sections.length) return sections;
  const next = [...sections];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function splitSection(sections: ScriptSection[], id: string, at?: string): ScriptSection[] {
  const now = stamp(at);
  return sections.flatMap((s) => {
    if (s.id !== id) return [s];
    const sentences = s.text.match(/[^.!?]+[.!?]+["”)]?\s*/g)?.map((x) => x.trim()).filter(Boolean) ?? [];
    if (sentences.length < 2) return [s];
    const mid = Math.ceil(sentences.length / 2);
    return [
      { ...s, text: sentences.slice(0, mid).join(" "), edited: true, updatedAt: now },
      { ...s, id: newSectionId(), heading: `${s.heading} (cont.)`, text: sentences.slice(mid).join(" "), aiGenerated: false, edited: true, sceneIds: [], updatedAt: now },
    ];
  });
}

export function mergeSections(sections: ScriptSection[], firstId: string, at?: string): ScriptSection[] {
  const now = stamp(at);
  const out: ScriptSection[] = [];
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (s.id === firstId && i + 1 < sections.length) {
      const n = sections[i + 1];
      out.push({ ...s, text: `${s.text}\n\n${n.text}`.trim(), edited: true, updatedAt: now });
      i += 1;
    } else {
      out.push(s);
    }
  }
  return out;
}

export function editSectionText(sections: ScriptSection[], id: string, text: string, at?: string): ScriptSection[] {
  const now = stamp(at);
  return sections.map((s) => (s.id === id ? { ...s, text, edited: true, updatedAt: now } : s));
}

/* ---------------- Versions ---------------- */

export function snapshotVersion(
  script: Script,
  name: string,
  note: string,
  opts?: { id?: string; at?: string },
): Script {
  const at = stamp(opts?.at);
  const version: ScriptVersion = {
    id: opts?.id ?? nextId("ver"),
    name: name.trim() || `Version ${script.versions.length + 1}`,
    note: note.trim(),
    at,
    sections: structuredClone(script.sections),
  };
  return { ...script, versions: [version, ...script.versions].slice(0, 20), updatedAt: at };
}

export function restoreVersion(script: Script, versionId: string, at?: string): Script {
  const version = script.versions.find((v) => v.id === versionId);
  if (!version) throw new Error("Version not found.");
  // Current work is snapshotted first — restores never destroy.
  const withBackup = snapshotVersion(script, "Pre-restore backup", `Before restoring “${version.name}”.`);
  return { ...withBackup, sections: structuredClone(version.sections), updatedAt: stamp(at) };
}

export interface VersionDiff {
  added: number;
  removed: number;
  changed: number;
  wordDelta: number;
}

export function diffVersions(a: ScriptVersion, b: ScriptVersion): VersionDiff {
  const aMap = new Map(a.sections.map((s) => [s.id, s]));
  const bMap = new Map(b.sections.map((s) => [s.id, s]));
  let added = 0;
  let removed = 0;
  let changed = 0;
  for (const [id, bs] of bMap) {
    const as = aMap.get(id);
    if (!as) added += 1;
    else if (as.text !== bs.text || as.heading !== bs.heading) changed += 1;
  }
  for (const id of aMap.keys()) if (!bMap.has(id)) removed += 1;
  const words = (v: ScriptVersion) => v.sections.reduce((n, s) => n + countWords(s.text), 0);
  return { added, removed, changed, wordDelta: words(b) - words(a) };
}

/* ---------------- Loops ---------------- */

export function addLoop(
  loops: LoopItem[],
  input: Omit<LoopItem, "id">,
  opts?: { id?: string },
): LoopItem[] {
  if (!input.text.trim()) throw new Error("Loop text cannot be empty.");
  return [...loops, { ...input, text: input.text.trim(), id: opts?.id ?? nextId("loop") }];
}

export function resolveLoop(loops: LoopItem[], id: string, payoffSectionId: string): LoopItem[] {
  return loops.map((l) => (l.id === id ? { ...l, payoffSectionId } : l));
}

export function unpaidLoops(loops: LoopItem[]): LoopItem[] {
  return loops.filter((l) => !l.payoffSectionId);
}

/* ---------------- Scenes ---------------- */

function hashText(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) | 0;
  }
  return `h${Math.abs(h).toString(36)}`;
}

/** One scene per section: the deterministic bridge into production. */
export function scenesFromSections(sections: ScriptSection[], wpm: number, at?: string): Scene[] {  const now = stamp(at);
  return sections.map((s, i) => ({
    id: nextId("scn"),
    number: i + 1,
    title: s.heading,
    sectionIds: [s.id],
    scriptText: s.text,
    durationSec: estimateSeconds(Math.max(1, countWords(s.text)), wpm),
    visual: "",
    narration: s.text.slice(0, 280),
    onScreenText: "",
    transition: "",
    shot: "",
    broll: "",
    assetsNeeded: [],
    notes: "",
    sourceHash: hashText(s.text),
    updatedAt: now,
  }));
}

/** Blank scene appended by hand. Numbering is reassigned by the caller. */
export function blankScene(number: number, at?: string): Scene {
  const now = stamp(at);
  return {
    id: nextId("scn"),
    number,
    title: "New scene",
    sectionIds: [],
    scriptText: "",
    durationSec: 10,
    visual: "",
    narration: "",
    onScreenText: "",
    transition: "",
    shot: "",
    broll: "",
    assetsNeeded: [],
    notes: "",
    sourceHash: "",
    updatedAt: now,
  };
}

/** True when any linked section changed since the scene was synced. */
export function sceneNeedsReview(scene: Scene, sections: ScriptSection[]): boolean {
  const linked = sections.filter((s) => scene.sectionIds.includes(s.id));
  if (linked.length === 0) return true;
  return hashText(linked.map((s) => s.text).join("\n")) !== scene.sourceHash;
}

export function markSceneSynced(scene: Scene, sections: ScriptSection[], at?: string): Scene {
  const linked = sections.filter((s) => scene.sectionIds.includes(s.id));
  return {
    ...scene,
    scriptText: linked.map((s) => s.text).join("\n\n"),
    sourceHash: hashText(linked.map((s) => s.text).join("\n")),
    updatedAt: stamp(at),
  };
}

function structuredClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
