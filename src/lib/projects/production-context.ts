import type { Project } from "@/src/lib/projects/types";
import type { ChannelDNA } from "@/src/lib/intelligence/dna";
import type { ProjectIntel } from "@/src/lib/intelligence/shelf";

/**
 * One production brief per project, shared by every tool (script, storyboard,
 * images, voice, video, packaging) so they all work from the same idea:
 * what the video is about, who it's for, how it should sound and look.
 */
export interface ProductionContext {
  topic: string;
  goal: string;
  platform: string;
  aspect: "16:9" | "9:16";
  audience: string;
  tone: string;
  visualStyle: string;
  avoid: string;
  angle: string;
  promise: string;
  hook: string;
  /** Short plain-text summary for prompts. */
  brief: string;
}

export function aspectForPlatform(platform: string, contentType = ""): "16:9" | "9:16" {
  return /short|reel|tiktok|story|vertical/i.test(`${platform} ${contentType}`) ? "9:16" : "16:9";
}

const clip = (s: string | undefined | null, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export function productionContext(input: { project: Project; dna?: ChannelDNA | null; intel?: ProjectIntel | null }): ProductionContext {
  const { project, dna, intel } = input;
  const strategy = intel?.strategy ?? null;
  const audienceProfile = intel?.audience ?? null;
  const topic = clip(strategy?.topic || project.topic || project.name, 200);
  const audience = clip(audienceProfile?.primary || dna?.audience, 200);
  const tone = clip(dna?.tone, 120);
  const visualStyle = clip(dna?.visualIdentity, 200);
  const avoid = clip(dna?.avoidWords, 150);
  const angle = clip(strategy?.angle, 200);
  const promise = clip(strategy?.promise, 200);
  const hook = clip(strategy?.hook, 200);
  const goal = clip(project.goal, 200);
  const brief = [
    `Video: ${topic}`,
    angle && `Angle: ${angle}`,
    promise && `Promise to the viewer: ${promise}`,
    audience && `Audience: ${audience}`,
    tone && `Tone: ${tone}`,
    visualStyle && `Visual identity: ${visualStyle}`,
    avoid && `Avoid: ${avoid}`,
    goal && `Goal: ${goal}`,
  ]
    .filter(Boolean)
    .join(". ");
  return { topic, goal, platform: project.platform, aspect: aspectForPlatform(project.platform, project.contentType), audience, tone, visualStyle, avoid, angle, promise, hook, brief };
}
