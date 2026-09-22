/**
 * Script + story domain — Phase 6.
 * Structured content (never one giant text field), deterministic local
 * assembly from Phase 5 intelligence, device-local versions. Provider
 * generation and cloud persistence arrive in Phase 11.
 */

export type SectionType =
  | "hook"
  | "introduction"
  | "setup"
  | "main-point"
  | "example"
  | "transition"
  | "climax"
  | "conclusion"
  | "cta"
  | "custom";

export interface ResearchRef {
  id: string;
  fact: string;
  source: string;
  verified: boolean; // always false until Phase 11 verification tooling
}

export type ClaimKind =
  | "factual"
  | "statistic"
  | "quote"
  | "date"
  | "name"
  | "technical"
  | "opinion";

export interface Claim {
  id: string;
  text: string;
  kind: ClaimKind;
  verified: boolean; // always false until Phase 11 verification tooling
}

export interface ScriptSection {
  id: string;
  type: SectionType;
  heading: string;
  text: string;
  aiGenerated: boolean;
  aiNote?: string;
  edited: boolean;
  sceneIds: string[];
  retentionNotes: string[];
  researchRefs: ResearchRef[];
  creatorNotes: string;
  updatedAt: string;
}

export interface ScriptVersion {
  id: string;
  name: string;
  note: string;
  at: string;
  sections: ScriptSection[];
}

export interface Script {
  projectId: string;
  format: string;
  tone: string;
  complexity: string;
  structure: string;
  targetWords: number;
  wpm: number;
  instruction: string;
  sections: ScriptSection[];
  versions: ScriptVersion[];
  notes: string;
  updatedAt: string;
}

export interface LoopItem {
  id: string;
  kind: "loop" | "question" | "promise" | "teaser";
  text: string;
  openedInSectionId: string;
  payoffSectionId?: string;
}

export type ShotType =
  | "Talking head"
  | "Screen capture"
  | "B-roll"
  | "Animation"
  | "Text on screen"
  | "Interview"
  | "Archival";

export interface Scene {
  id: string;
  number: number;
  title: string;
  sectionIds: string[];
  scriptText: string;
  durationSec: number;
  visual: string;
  narration: string;
  onScreenText: string;
  transition: string;
  shot: ShotType | "";
  broll: string;
  assetsNeeded: string[];
  notes: string;
  sourceHash: string;
  updatedAt: string;
}

export interface Storyboard {
  projectId: string;
  scenes: Scene[];
  updatedAt: string;
}
