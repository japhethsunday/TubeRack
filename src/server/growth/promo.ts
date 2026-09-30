import { getDb } from "@/src/server/db";
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

export const PROMO_STYLES = ["How-to tutorial", "Problem → solution", "Step-by-step guide", "Fast demo", "Myth vs fact", "Before / after", "Tips list", "Story", "Bold claim + proof"] as const;
/** Styles that teach a real creator skill first and show Recktube as the tool. */
export const TEACHING_STYLES = new Set<string>(["How-to tutorial", "Step-by-step guide", "Myth vs fact", "Tips list"]);

/** Style for the i-th video of a batch: 3 of every 4 teach, the 4th is a straight promo. */
export function styleFor(i: number, seed = Date.now()): string {
  const teach = PROMO_STYLES.filter((x) => TEACHING_STYLES.has(x));
  const promo = PROMO_STYLES.filter((x) => !TEACHING_STYLES.has(x));
  const n = Math.abs(Math.floor(seed / 1000)) + i;
  return (i + 1) % 4 === 0 ? promo[n % promo.length] : teach[n % teach.length];
}
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

/** Titles and hooks of recent promos, so every new one is a new idea. */
async function recentPromoIdeas(): Promise<string[]> {
  try {
    const db = getDb();
    if (!db) return [];
    const rows = await db`SELECT package->>'title' AS title, package->>'hook' AS hook FROM promo_videos ORDER BY created_at DESC LIMIT 40`;
    return rows.map((r) => `${String(r.title ?? "").slice(0, 90)} — “${String(r.hook ?? "").slice(0, 120)}”`).filter((x) => x.length > 8);
  } catch {
    return [];
  }
}

export async function writePromo(input: { feature: string; style: string; platform: string; lengthSec: number; angle: string }): Promise<PromoPackage> {
  if (!isTextConfigured()) throw backendUnavailable("AI writing");
  const f = PROMO_FEATURES.find((x) => x.id === input.feature) ?? PROMO_FEATURES[0];
  const made = await recentPromoIdeas();
  const prompt = `You are a performance video marketer making a vertical 9:16 short-form ad for Recktube, made with Recktube itself.

${PRODUCT_FACTS}

Feature to promote: ${f.name} — ${f.pitch}
Style: ${input.style}. Platform: ${input.platform}. Target length: ${input.lengthSec} seconds.
${TEACHING_STYLES.has(input.style) ? `This is a TEACHING Short: the title and hook promise one concrete, searchable creator skill ("How to post on TikTok the right way", "How to get your first 1,000 subscribers", "How to write a hook that stops the scroll", "How to pick a profitable niche", "How to make Shorts without showing your face", "How to schedule a week of videos"…) — invent a fresh one people actually search for. Give genuinely useful, correct steps anyone can follow, and show ${f.name} naturally as the fastest way to do it. The value comes first; the Recktube mention is part of the solution, not a hard sell.` : ""}
${input.angle ? `Founder's angle: ${input.angle.slice(0, 600)}` : "No angle given: INVENT a fresh, specific idea yourself — e.g. a concrete creator in a real niche (cooking, finance, gaming, faceless history…) with a real problem this feature solves, a surprising insight about growing on YouTube, or a relatable moment creators know. Be original, not generic."}
${made.length ? `\nALREADY MADE — do NOT reuse these ideas, hooks, scenarios or titles, and make this one clearly different from all of them:\n${made.map((m) => `- ${m}`).join("\n")}\n` : ""}
Rules:
- Hook in the first 2 seconds that stops the scroll (a pain creators feel, or a surprising outcome). No clickbait lies.
- Only real features and facts from above. No invented stats, user counts, testimonials, prices or guarantees.
- 5–9 scenes; durations add up to about ${input.lengthSec}s. Each scene: what's on screen (screen recording of the app, b-roll, text animation…), short bold on-screen text (≤ 6 words), and the voice-over line.
- Voice-over: natural, energetic, spoken English; the scenes' narration joined together must read as ONE flowing script (it is recorded in a single take). Aim for about ${Math.round(input.lengthSec * 2.4)} words in total so the video really lasts about ${input.lengthSec}s; each scene's narration is 1–2 complete sentences (roughly 8–25 words), never a fragment.
- End with a clear CTA to try Recktube free at recktube.xyz.
- Captions for YouTube Shorts, TikTok and Instagram Reels: a title/first line, a caption within that platform's norms, and 5–10 relevant hashtags (always include #Recktube).
- Thumbnail/cover text ≤ 5 words.
- On-screen text must be a clear, grammatical phrase a stranger understands instantly (e.g. "Scripts that hook viewers", not "One studio no exports"). Never say things like "no exports", "no editing" or "no work" — Recktube does export videos; say what it does instead.
- Each scene's narration is one complete sentence or phrase (no dangling dashes); keep dashes out of narration — use commas or full stops.

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
