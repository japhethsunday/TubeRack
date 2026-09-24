import type { AudienceProfile, StrategyBrief } from "@/src/lib/intelligence/profiles";
import type { RetentionFlag } from "@/src/lib/intelligence/retention";

/**
 * Intelligence shelf: saved opportunities + per-project intelligence.
 * Pure ops over device-local state. Versions and approvals are real local
 * records; provider-generated content arrives in Phase 11.
 */

export type OpportunityStatus = "candidate" | "chosen" | "dismissed";

export interface Opportunity {
  id: string;
  title: string;
  topic: string;
  angle: string;
  audience: string;
  reasoning: string;
  format: string;
  hook: string;
  sourceTask: string;
  projectId?: string;
  status: OpportunityStatus;
  createdAt: string;
}

export interface OpportunityInput {
  title: string;
  topic: string;
  angle: string;
  audience: string;
  reasoning: string;
  format: string;
  hook: string;
  sourceTask: string;
  projectId?: string;
}

export type IntelItemStatus = "draft" | "approved" | "rejected";

export interface IntelItem {
  id: string;
  text: string;
  note: string;
  status: IntelItemStatus;
  createdAt: string;
}

export interface RetentionRecord {
  id: string;
  summary: string;
  flags: RetentionFlag[];
  estimateMinutes: number;
  createdAt: string;
}

export interface HistoryEntry {
  at: string;
  kind: string;
  summary: string;
}

export interface ProjectIntel {
  projectId: string;
  audience: AudienceProfile | null;
  strategy: StrategyBrief | null;
  titles: IntelItem[];
  hooks: IntelItem[];
  retention: RetentionRecord[];
  brief: string;
  history: HistoryEntry[];
  /** Generated results (shot lists, thumbnail concepts, repurposing…) kept per tool. */
  outputs?: Record<string, SavedOutput>;
  updatedAt: string;
}

export interface SavedOutput {
  text: string;
  at: string;
}

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

/** For tests: deterministic ids. */
export function __resetIntelIds(): void {
  seq = 0;
}

export function emptyIntel(projectId: string, at?: string): ProjectIntel {
  const stamp = at ?? new Date().toISOString();
  return {
    projectId,
    audience: null,
    strategy: null,
    titles: [],
    hooks: [],
    retention: [],
    brief: "",
    history: [],
    updatedAt: stamp,
  };
}

function stampHistory(intel: ProjectIntel, kind: string, summary: string, at?: string): ProjectIntel {
  const entry: HistoryEntry = { at: at ?? new Date().toISOString(), kind, summary };
  return {
    ...intel,
    history: [entry, ...intel.history].slice(0, 50),
    updatedAt: entry.at,
  };
}

export function saveOpportunity(
  list: Opportunity[],
  input: OpportunityInput,
  opts?: { id?: string; at?: string },
): Opportunity[] {
  const item: Opportunity = {
    id: opts?.id ?? nextId("opp"),
    ...input,
    status: "candidate",
    createdAt: opts?.at ?? new Date().toISOString(),
  };
  return [item, ...list];
}

export function setOpportunityStatus(
  list: Opportunity[],
  id: string,
  status: OpportunityStatus,
): Opportunity[] {
  return list.map((o) => (o.id === id ? { ...o, status } : o));
}

export function saveAudience(intel: ProjectIntel, audience: AudienceProfile, at?: string): ProjectIntel {
  return stampHistory({ ...intel, audience }, "audience", "Audience profile saved.", at);
}

export function saveStrategy(intel: ProjectIntel, strategy: StrategyBrief, at?: string): ProjectIntel {
  return stampHistory({ ...intel, strategy }, "strategy", "Strategy brief saved.", at);
}

export function addIntelItem(
  intel: ProjectIntel,
  field: "titles" | "hooks",
  text: string,
  note: string,
  opts?: { id?: string; at?: string },
): ProjectIntel {
  const clean = text.trim();
  if (!clean) throw new Error("Cannot save empty text.");
  const item: IntelItem = {
    id: opts?.id ?? nextId("it"),
    text: clean,
    note,
    status: "draft",
    createdAt: opts?.at ?? new Date().toISOString(),
  };
  return stampHistory(
    { ...intel, [field]: [item, ...intel[field]] },
    field === "titles" ? "title" : "hook",
    `Saved ${field === "titles" ? "title" : "hook"}: “${clean.slice(0, 60)}”.`,
    opts?.at,
  );
}

export function setIntelItemStatus(
  intel: ProjectIntel,
  field: "titles" | "hooks",
  id: string,
  status: IntelItemStatus,
): ProjectIntel {
  return stampHistory(
    { ...intel, [field]: intel[field].map((i) => (i.id === id ? { ...i, status } : i)) },
    "review",
    `${status === "approved" ? "Approved" : "Rejected"} a ${field === "titles" ? "title" : "hook"}.`,
  );
}

export function editIntelItem(
  intel: ProjectIntel,
  field: "titles" | "hooks",
  id: string,
  text: string,
): ProjectIntel {
  const clean = text.trim();
  if (!clean) throw new Error("Cannot save empty text.");
  return stampHistory(
    { ...intel, [field]: intel[field].map((i) => (i.id === id ? { ...i, text: clean, status: "draft" as const } : i)) },
    "edit",
    `Edited a ${field === "titles" ? "title" : "hook"} — back to draft for review.`,
  );
}

export function addRetentionRecord(
  intel: ProjectIntel,
  record: Omit<RetentionRecord, "id" | "createdAt">,
  opts?: { id?: string; at?: string },
): ProjectIntel {
  const entry: RetentionRecord = {
    id: opts?.id ?? nextId("ret"),
    ...record,
    createdAt: opts?.at ?? new Date().toISOString(),
  };
  return stampHistory(
    { ...intel, retention: [entry, ...intel.retention].slice(0, 20) },
    "retention",
    `Retention review saved (${record.flags.length} note(s)).`,
    opts?.at,
  );
}

export function saveOutput(intel: ProjectIntel, key: string, text: string, label: string, at?: string): ProjectIntel {
  const when = at ?? new Date().toISOString();
  return stampHistory({ ...intel, outputs: { ...(intel.outputs ?? {}), [key]: { text, at: when } } }, "output", `${label} generated.`, when);
}

export function saveBrief(intel: ProjectIntel, brief: string, at?: string): ProjectIntel {
  return stampHistory({ ...intel, brief }, "brief", "Production brief assembled.", at);
}

export function intelCounts(intel: ProjectIntel): {
  titles: number;
  hooks: number;
  approved: number;
  retention: number;
  hasAudience: boolean;
  hasStrategy: boolean;
} {
  return {
    titles: intel.titles.length,
    hooks: intel.hooks.length,
    approved: [...intel.titles, ...intel.hooks].filter((i) => i.status === "approved").length,
    retention: intel.retention.length,
    hasAudience: intel.audience !== null,
    hasStrategy: intel.strategy !== null,
  };
}
