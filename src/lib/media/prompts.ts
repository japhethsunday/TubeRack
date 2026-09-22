/**
 * Visual prompt assistant — Phase 7.
 * Deterministic assembly from scene + script + DNA + platform: structured
 * sections the creator edits before any generation. No hidden reasoning,
 * no model calls.
 */

export interface PromptInput {
  sceneTitle: string;
  scriptExcerpt: string;
  visualDirection: string;
  tone: string;
  positioning: string;
  avoidStyles: string;
  visualStyle: string;
  colorDirection: string;
  platform: string;
  instruction: string;
}

export interface PromptSection {
  label: string;
  text: string;
}

export const PROMPT_METHOD =
  "Local assembly (no AI provider). Scene text, DNA, and consistency settings are organized into generation-ready " +
  "sections. Edit every line — providers receive what you approve in Phase 11.";

export function buildVisualPrompt(input: PromptInput): PromptSection[] {
  const excerpt = input.scriptExcerpt.trim().slice(0, 220) || "(no script excerpt — add scene narration first)";
  const pick = (v: string, fallback: string) => (v.trim() ? v.trim() : fallback);
  return [
    { label: "Subject", text: `${input.sceneTitle.trim() || "Untitled scene"} — ${excerpt}` },
    { label: "Environment", text: pick(input.visualDirection, "Not directed yet — describe the setting.") },
    { label: "Composition", text: input.platform === "YouTube Shorts" || input.platform === "TikTok" || input.platform === "Instagram Reels" ? "Vertical 9:16, subject centered, safe margins for captions." : "Widescreen 16:9, rule-of-thirds subject placement." },
    { label: "Camera", text: pick(input.visualStyle, "Match the project's camera language.") },
    { label: "Lighting", text: "Soft key with motivated contrast; readable at thumbnail size." },
    { label: "Style", text: pick(input.tone, "Channel tone") + (input.colorDirection ? ` · ${input.colorDirection}` : "") },
    { label: "Motion", text: "Subtle push-in for video; static composition for stills." },
    { label: "Mood", text: pick(input.positioning, "Match the video's promise.") },
    { label: "Aspect ratio", text: input.platform === "YouTube Shorts" || input.platform === "TikTok" || input.platform === "Instagram Reels" ? "9:16" : "16:9" },
    ...(input.avoidStyles.trim() ? [{ label: "Avoid", text: input.avoidStyles.trim() }] : []),
    ...(input.instruction.trim() ? [{ label: "Creator instruction", text: input.instruction.trim() }] : []),
  ];
}

export function promptToText(sections: PromptSection[]): string {
  return sections.map((s) => `${s.label}: ${s.text}`).join("\n");
}
