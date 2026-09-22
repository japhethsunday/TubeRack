import type { IntelligenceTaskType } from "@/src/lib/intelligence/tasks";
import type { ChannelDNA } from "@/src/lib/intelligence/dna";
import { missingDnaFields } from "@/src/lib/intelligence/dna";
import type { ResearchSource } from "@/src/lib/ai-gateway/intelligence";

export interface TaskContextInput {
  idea?: string;
  audience?: string;
  channelName?: string;
  projectName?: string;
  projectTopic?: string;
  projectGoal?: string;
  dna?: ChannelDNA | null;
  research?: ResearchSource[];
  instruction?: string;
}

export interface AssembledContext {
  task: IntelligenceTaskType;
  parts: { label: string; present: boolean; summary: string }[];
  completeness: number; // share of applicable parts present
  missing: string[];
  payload: Record<string, string>;
}

/**
 * Structured context assembly: every intelligence run declares exactly what
 * fed it. Reusable by all future AI modules; providers receive this payload
 * in Phase 11 instead of ad-hoc prompts.
 */
export function assembleContext(task: IntelligenceTaskType, input: TaskContextInput): AssembledContext {
  const parts: AssembledContext["parts"] = [];
  const payload: Record<string, string> = {};

  function add(label: string, value: string | undefined, summaryEmpty: string) {
    const present = Boolean(value && value.trim().length > 0);
    parts.push({ label, present, summary: present ? (value as string).trim().slice(0, 140) : summaryEmpty });
    if (present) payload[label] = (value as string).trim();
  }

  add("Idea", input.idea, "No idea supplied — analysis will be generic.");
  add("Audience", input.audience, "No audience profile attached.");
  add("Channel", input.channelName, "No channel context.");
  add("Project", input.projectName, "Standalone run — not attached to a project.");
  add("Project topic", input.projectTopic, "No project topic.");
  add("Project goal", input.projectGoal, "No project goal.");
  add("Creator instruction", input.instruction, "No extra instruction.");

  const dnaMissing = input.dna ? missingDnaFields(input.dna) : [];
  const dnaPresent = Boolean(input.dna) && dnaMissing.length < 11;
  parts.push({
    label: "Channel DNA",
    present: dnaPresent,
    summary: !input.dna
      ? "No DNA defined."
      : dnaMissing.length === 0
        ? "Complete"
        : `Missing: ${dnaMissing.slice(0, 3).join(", ")}${dnaMissing.length > 3 ? "…" : ""}`,
  });
  if (input.dna && dnaMissing.length < 11) {
    payload["Channel DNA"] = dnaSummary(input.dna);
  }

  const research = input.research ?? [];
  parts.push({
    label: "Research",
    present: research.length > 0,
    summary: research.length > 0 ? `${research.length} source(s) attached.` : "No research attached (Phase 6 expands collection).",
  });
  if (research.length > 0) {
    payload["Research"] = research.map((r) => `${r.title}: ${r.summary}`).join("\n").slice(0, 2000);
  }

  const present = parts.filter((p) => p.present).length;
  const missing = parts.filter((p) => !p.present).map((p) => p.label);
  return {
    task,
    parts,
    completeness: Math.round((present / parts.length) * 100),
    missing,
    payload,
  };
}

function dnaSummary(dna: ChannelDNA): string {
  return [
    dna.identity && `Identity: ${dna.identity}`,
    dna.audience && `Audience: ${dna.audience}`,
    dna.tone && `Tone: ${dna.tone}`,
    dna.positioning && `Positioning: ${dna.positioning}`,
    dna.avoidWords && `Avoid: ${dna.avoidWords}`,
  ]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 1000);
}
