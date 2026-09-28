import { randomUUID } from "node:crypto";
import { GeminiTextProvider, isTextConfigured } from "@/src/server/ai/gemini";
import { PRODUCT_FACTS } from "@/src/server/support/facts";
import { parseJsonObject } from "@/src/server/admin-ai";
import { backendUnavailable, validationError } from "@/src/server/errors";
import { syncPut } from "@/src/server/sync";
import type { SessionUser } from "@/src/server/auth";
import { PROJECT_STAGES } from "@/src/types/domain";

/**
 * Promo videos for marketing Recktube itself ("made with Recktube"). The AI
 * writes a complete short-form ad package; "Create project" turns it into a
 * normal project (script + storyboard) in the admin's own workspace, so the
 * video is produced and exported with the same studio creators use.
 */

export const PROMO_FEATURES = [
  { id: "overview", name: "Recktube overview", path: "/", pitch: "One studio from idea to published YouTube video." },
  { id: "content-creator", name: "Content Creator", path: "/content-creator", pitch: "Video ideas from what's working in your niche right now." },
  { id: "channel-creator", name: "Channel Creator", path: "/channel-creator", pitch: "A whole channel plan — name, positioning, branding and 30 ideas — in a minute." },
  { id: "script-studio", name: "Script Studio", path: "/studio/script", pitch: "Retention-focused scripts with hooks that hold viewers." },
  { id: "video-studio", name: "Video Studio", path: "/studio/video", pitch: "Voice-over, visuals, music and captions assembled into a finished video." },
  { id: "thumbnails", name: "Thumbnails & titles", path: "/studio/package", pitch: "Click-worthy titles, descriptions, tags and thumbnails." },
  { id: "niches", name: "Most Paying Niches", path: "/intelligence/paying-niches", pitch: "Find niches with real demand and strong earning potential." },
  { id: "trends", name: "Trend Radar", path: "/intelligence/trends", pitch: "Daily briefs on what's taking off in your niche." },
  { id: "publish", name: "Publish to YouTube", path: "/youtube", pitch: "Publish and schedule straight to your channel, then track results." },
] as const;

export const PROMO_STYLES = ["Problem → solution", "Fast demo", "Before / after", "Tips list", "Story", "Bold claim + proof"] as const;
export const PROMO_PLATFORMS = ["YouTube Shorts", "TikTok", "Instagram Reels"] as const;

export interface PromoScene { durationSec: number; visual: string; onScreenText: string; narration: string }
export interface PromoPackage {
  title: string;
  hook: string;
  voiceover: string;
  scenes: PromoScene[];
  cta: string;
  thumbnailText: string;
  captions: { platform: string; title: string; caption: string; hashtags: string[] }[];
}

const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export function normalizePackage(o: Record<string, unknown>): PromoPackage {
  const scenes = (Array.isArray(o.scenes) ? o.scenes : [])
    .slice(0, 12)
    .map((x) => {
      const r = (x ?? {}) as Record<string, unknown>;
      return {
        durationSec: Math.max(1, Math.min(20, Math.round(Number(r.durationSec) || 4))),
        visual: s(r.visual, 400),
        onScreenText: s(r.onScreenText, 80),
        narration: s(r.narration, 400),
      };
    })
    .filter((x) => x.visual || x.narration);
  const captions = (Array.isArray(o.captions) ? o.captions : []).slice(0, 3).map((x) => {
    const r = (x ?? {}) as Record<string, unknown>;
    return {
      platform: s(r.platform, 40),
      title: s(r.title, 100),
      caption: s(r.caption, 2200),
      hashtags: (Array.isArray(r.hashtags) ? r.hashtags : []).map((h) => `#${String(h).replace(/^#+/, "").replace(/[^\w]/g, "")}`).filter((h) => h.length > 1).slice(0, 12),
    };
  });
  if (!scenes.length) throw validationError("The writer returned no scenes. Try again.");
  return {
    title: s(o.title, 100) || "Made with Recktube",
    hook: s(o.hook, 200),
    voiceover: s(o.voiceover, 3000) || scenes.map((x) => x.narration).join(" "),
    scenes,
    cta: s(o.cta, 120) || "Try Recktube free at recktube.xyz",
    thumbnailText: s(o.thumbnailText, 40),
    captions,
  };
}

export async function writePromo(input: { feature: string; style: string; platform: string; lengthSec: number; angle: string }): Promise<PromoPackage> {
  if (!isTextConfigured()) throw backendUnavailable("AI writing");
  const f = PROMO_FEATURES.find((x) => x.id === input.feature) ?? PROMO_FEATURES[0];
  const prompt = `You are a performance video marketer making a vertical 9:16 short-form ad for Recktube, made with Recktube itself.

${PRODUCT_FACTS}

Feature to promote: ${f.name} — ${f.pitch}
Style: ${input.style}. Platform: ${input.platform}. Target length: ${input.lengthSec} seconds.
${input.angle ? `Founder's angle: ${input.angle.slice(0, 600)}` : ""}

Rules:
- Hook in the first 2 seconds that stops the scroll (a pain creators feel, or a surprising outcome). No clickbait lies.
- Only real features and facts from above. No invented stats, user counts, testimonials, prices or guarantees.
- 5–9 scenes; durations add up to about ${input.lengthSec}s. Each scene: what's on screen (screen recording of the app, b-roll, text animation…), short bold on-screen text (≤ 6 words), and the voice-over line.
- Voice-over: natural, energetic, spoken English; the scenes' narration joined together.
- End with a clear CTA to try Recktube free at recktube.xyz.
- Captions for YouTube Shorts, TikTok and Instagram Reels: a title/first line, a caption within that platform's norms, and 5–10 relevant hashtags (always include #Recktube).
- Thumbnail/cover text ≤ 5 words.

Respond ONLY with JSON:
{"title":"","hook":"","voiceover":"","cta":"","thumbnailText":"","scenes":[{"durationSec":3,"visual":"","onScreenText":"","narration":""}],"captions":[{"platform":"YouTube Shorts","title":"","caption":"","hashtags":["Recktube"]}]}`;
  const { text } = await new GeminiTextProvider().generateText({ prompt, maxTokens: 2500, json: true });
  return normalizePackage(parseJsonObject(text));
}

/** Turn a promo into a normal Short project (script + storyboard) in the admin's workspace. */
export async function createPromoProject(user: SessionUser, promo: { feature: string; platform: string; pkg: PromoPackage }): Promise<string> {
  const now = new Date().toISOString();
  const f = PROMO_FEATURES.find((x) => x.id === promo.feature) ?? PROMO_FEATURES[0];
  const projectId = `prj_promo_${randomUUID().slice(0, 12)}`;
  const stages: Record<string, string> = {};
  for (const st of PROJECT_STAGES) stages[st] = "not-started";
  stages.idea = "complete";
  stages.script = "complete";
  stages.storyboard = "complete";
  stages.voice = "in-progress";
  await syncPut("workspace", user, {
    projects: [{
      id: projectId,
      name: `Promo: ${promo.pkg.title}`.slice(0, 120),
      contentType: "Short",
      platform: promo.platform,
      topic: `${f.name} — ${f.pitch}`,
      description: `Recktube promo video.\n\nHook: ${promo.pkg.hook}\nCTA: ${promo.pkg.cta}`,
      goal: "Promote Recktube and drive sign-ups",
      stages,
      currentStage: "voice",
      status: "active",
      createdAt: now,
      updatedAt: now,
    }],
    channels: [],
    events: [],
    deletedProjectIds: [],
    deletedChannelIds: [],
  });
  const sceneIds = promo.pkg.scenes.map(() => `scn_${randomUUID().slice(0, 10)}`);
  const sections = promo.pkg.scenes.map((sc, i) => ({
    id: `sec_${randomUUID().slice(0, 10)}`,
    type: i === 0 ? "hook" : i === promo.pkg.scenes.length - 1 ? "cta" : "main-point",
    heading: i === 0 ? "Hook" : i === promo.pkg.scenes.length - 1 ? "Call to action" : `Beat ${i}`,
    text: sc.narration,
    aiGenerated: true,
    edited: false,
    sceneIds: [sceneIds[i]],
    retentionNotes: [],
    researchRefs: [],
    creatorNotes: sc.onScreenText ? `On screen: ${sc.onScreenText}` : "",
    updatedAt: now,
  }));
  const scenes = promo.pkg.scenes.map((sc, i) => ({
    id: sceneIds[i],
    number: i + 1,
    title: sections[i].heading,
    sectionIds: [sections[i].id],
    scriptText: sc.narration,
    durationSec: sc.durationSec,
    visual: sc.visual,
    narration: sc.narration,
    onScreenText: sc.onScreenText,
    transition: i === 0 ? "" : "Quick cut",
    shot: "Screen capture",
    broll: "",
    assetsNeeded: [],
    notes: "",
    sourceHash: "",
    updatedAt: now,
  }));
  await syncPut("scripts", user, {
    scripts: {
      [projectId]: {
        projectId,
        format: "Short",
        tone: "Energetic",
        complexity: "Simple",
        structure: "Hook → beats → CTA",
        targetWords: promo.pkg.voiceover.split(/\s+/).length,
        wpm: 160,
        instruction: "Recktube promo",
        sections,
        versions: [],
        notes: `Captions & hashtags:\n\n${promo.pkg.captions.map((c) => `${c.platform}: ${c.title}\n${c.caption}\n${c.hashtags.join(" ")}`).join("\n\n")}`,
        updatedAt: now,
      },
    },
    boards: { [projectId]: { projectId, scenes, updatedAt: now } },
    loops: {},
    deletedScripts: [],
  });
  return projectId;
}
