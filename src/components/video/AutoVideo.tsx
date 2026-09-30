"use client";

import { ProjectPreview } from "@/src/components/video/ProjectPreview";
import { ProjectPublish } from "@/src/components/video/ProjectPublish";
import { ProjectSave } from "@/src/components/video/ProjectSave";
import { sceneSpeech } from "@/src/lib/script/engine";
import { useProductionContext } from "@/src/components/projects/useProductionContext";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clapperboard, Crown, Download, Loader2, TriangleAlert, X } from "lucide-react";
import { usePaid } from "@/src/lib/use-paid";
import { toDataUrl } from "@/src/components/media/AiClip";
import { api, ApiError, setVideoPass } from "@/src/lib/api";
import { keepAwake } from "@/src/lib/wake-lock";
import { MUSIC_MOODS, musicRecipe } from "@/src/lib/media/audio";
import { generateProviderImage, retryBusy, synthesizeProviderSpeech } from "@/src/lib/ai-client";
import { scenesFromSections } from "@/src/lib/script/engine";
import type { Scene, ScriptSection } from "@/src/lib/script/types";
import type { MediaAsset } from "@/src/lib/media/types";
import { buildFromScenes } from "@/src/lib/video/build";
import { beatTag, planBeats } from "@/src/lib/video/beats";
import { presetById, projectIsShort } from "@/src/lib/video/presets";
import { useScripts } from "@/src/components/script/ScriptProvider";
import { useMedia } from "@/src/components/media/MediaProvider";
import { useVideo } from "@/src/components/video/VideoProvider";
import { Modal } from "@/src/components/ui/overlays";
import { Button } from "@/src/components/ui/Button";
import { cx } from "@/src/components/ui/cx";
import { usePackaging } from "@/src/components/package/PackagingProvider";
import { thumbnailArtPrompt, titleOverlays, uploadToBase } from "@/src/lib/package/auto-thumb";
import { MUSIC_MOOD_OPTIONS } from "@/src/components/media/music-library";

type StepState = "pending" | "running" | "done" | "failed" | "partial";
interface Step {
  id: "scenes" | "voice" | "visuals" | "music" | "build" | "thumbnail";
  label: string;
  state: StepState;
  detail: string;
}

const INITIAL: Step[] = [
  { id: "scenes", label: "Plan scenes and shots", state: "pending", detail: "" },
  { id: "voice", label: "Record voice-over", state: "pending", detail: "" },
  { id: "visuals", label: "Find and generate visuals", state: "pending", detail: "" },
  { id: "music", label: "Add background music", state: "pending", detail: "" },
  { id: "build", label: "Assemble the timeline", state: "pending", detail: "" },
  { id: "thumbnail", label: "Design the thumbnail", state: "pending", detail: "" },
];

type VisualMode = "mix" | "stock" | "ai";

/** AI motion clips per generated video (each takes 1–4 minutes and uses video credits). */
const AI_MOTION_MAX = 3;

const STOP = new Set("a an the of and or to in on at for with by from into over under this that these those is are was be being been as it its their his her our your my close up closeup close-up medium tight extreme over-the-shoulder wide shot shots angle view camera cinematic scene showing shows image photo realistic style lighting background foreground".split(" "));

/** A short stock-library query from a shot description ("Wide shot of a soldier in the desert" → "soldier desert"). */
/** True when a stock clip's tags share a meaningful word with the search. */
export function stockMatches(tags: string, query: string): boolean {
  const have = new Set(tags.toLowerCase().split(/[^\p{L}\p{N}]+/u).map((w) => w.replace(/s$/, "")));
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/s$/, ""))
    .some((w) => w.length > 2 && !STOP.has(w) && have.has(w));
}

/** Stricter match for beats: the subject (first word) must be tagged, plus most of the other words. */
export function stockMatchesStrict(tags: string, query: string): boolean {
  const have = new Set(tags.toLowerCase().split(/[^\p{L}\p{N}]+/u).map((w) => w.replace(/s$/, "")));
  const want = query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/s$/, ""))
    .filter((w) => w.length > 2 && !STOP.has(w));
  if (!want.length || !have.has(want[0])) return false;
  return want.filter((w) => have.has(w)).length >= Math.ceil(want.length / 2);
}

export function stockQuery(visual: string, words = 3): string {
  return visual
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .slice(0, words)
    .join(" ");
}

interface StockHit {
  id: string;
  title: string;
  durationSec: number | null;
  width: number;
  height: number;
}

/** Duration of an audio URL in seconds (0 when unknown). */
function audioDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => resolve(0);
    a.src = url;
    setTimeout(() => resolve(0), 15000);
  });
}

/** Run tasks with limited parallelism, stopping early when cancelled. */
async function pool<T>(items: T[], size: number, cancelled: () => boolean, fn: (item: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length && !cancelled()) {
        const i = next++;
        await fn(items[i], i);
      }
    }),
  );
}

/**
 * Script → finished edit: scenes from the script, a Gemini shot list,
 * Gemini voice-over per scene (scene length = real voice length), a Gemini
 * image per scene, then a timeline with visuals, voice, overlays and timed
 * captions. Runs only when asked, only on this project; an existing
 * timeline is snapshotted before it is replaced.
 */
export function GenerateVideoDialog({
  project,
  sections,
  wpm,
  onClose,
  auto,
}: {
  project: { id: string; name: string; topic: string; platform: string; contentType: string };
  sections: ScriptSection[];
  wpm: number;
  onClose: () => void;
  /** Hands-free (Promo autopilot): start at once, replace any old edit, report the outcome. */
  auto?: {
    onDone: () => void;
    onFail: (message: string) => void;
    /** Fixed narrator, delivery and music (e.g. promo videos keep one brand voice). */
    voice?: string;
    style?: string;
    music?: string;
  };
}) {
  const router = useRouter();
  const { putScenes } = useScripts();
  const production = useProductionContext(project.id);
  const media = useMedia();
  const packaging = usePackaging();
  const video = useVideo();
  const [steps, setSteps] = useState<Step[]>(INITIAL);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [replaceOk, setReplaceOk] = useState(false);
  const [visualMode, setVisualMode] = useState<VisualMode>("mix");
  const [musicMood, setMusicMood] = useState<string>(auto?.music ?? "background");
  const paidUser = usePaid();
  const [aiMotion, setAiMotion] = useState(false);
  const cancelled = useRef(false);

  const [format, setFormat] = useState<"long" | "short">(projectIsShort(project) ? "short" : "long");
  const vertical = format === "short";
  const aspect: "16:9" | "9:16" = vertical ? "9:16" : "16:9";
  const writable = sections.filter((s) => s.text.trim().length > 0);
  const existingClips = video.compFor(project.id).clips.length;
  const set = (id: Step["id"], patch: Partial<Step>) => setSteps((all) => all.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  /** Keep a device copy so the editor plays generated media instantly. */
  async function keepLocal(asset: MediaAsset, url: string) {
    try {
      const res = await fetch(url, { credentials: "same-origin" });
      if (res.ok) await media.persistBlob(asset.id, await res.blob());
    } catch {
      // The stored URL still works; this is only a speed-up.
    }
  }

  // Hands-free: start once, with the old edit replaced (a snapshot is still kept).
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!auto || autoStarted.current || writable.length === 0) return;
    const t = window.setTimeout(() => {
      if (autoStarted.current) return;
      autoStarted.current = true;
      void run().then((ok) => (ok ? auto.onDone() : auto.onFail(fatalRef.current || "Video generation stopped.")));
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start once, as soon as the script has loaded.
  }, [writable.length]);
  const fatalRef = useRef("");

  async function run(): Promise<boolean> {
    cancelled.current = false;
    setRunning(true);
    setFatal(null);
    setSteps(INITIAL);
    const isCancelled = () => cancelled.current;
    let pass: string | null = null;
    let built = false;
    const release = keepAwake(); // phones pause pages whose screen switches off
    try {
      // One flat price per generated video; its voice-overs and images are covered by the pass.
      const paid = await api.post<{ pass: string; cost: number }>("/api/v1/credits/video-pass", {});
      pass = paid.pass;
      setVideoPass(pass);
      // 1. Scenes + shot list.
      set("scenes", { state: "running" });
      const scenes: Scene[] = scenesFromSections(writable, wpm).map((s) => ({ ...s, narration: s.scriptText }));
      const beatsByScene = planBeats(scenes.map((s) => s.scriptText));
      const planned = await retryBusy(() => api.post<{ visuals: { visual: string; onScreenText: string; stockQuery?: string; beats?: { visual: string; stockQuery: string }[] }[] }>("/api/v1/ai/scene-visuals", {
        topic: production?.topic || project.topic || project.name,
        aspect,
        style: production?.visualStyle ?? "",
        brief: production?.brief ?? "",
        scenes: scenes.map((s, i) => ({ title: s.title, text: s.scriptText, beats: beatsByScene[i].map((b) => b.text) })),
      }));
      // Each beat's visual and stock words, with where it sits in its scene.
      const beatPlan = new Map<string, { from: number; to: number; visual: string; stockQuery: string }[]>();
      scenes.forEach((s, i) => {
        const v = planned.visuals[i];
        const beats = beatsByScene[i].length ? beatsByScene[i] : [{ text: s.scriptText, from: 0, to: 1 }];
        beatPlan.set(
          s.id,
          beats.map((b, j) => ({ from: b.from, to: b.to, visual: v?.beats?.[j]?.visual || v?.visual || s.title, stockQuery: v?.beats?.[j]?.stockQuery ?? (j === 0 ? v?.stockQuery ?? "" : "") })),
        );
        s.visual = planned.visuals[i]?.visual ?? s.title;
        s.onScreenText = planned.visuals[i]?.onScreenText ?? "";
      });
      putScenes(project.id, scenes);
      set("scenes", { state: "done", detail: `${scenes.length} scenes` });
      if (isCancelled()) return false;

      const made: MediaAsset[] = [];

      // 2. Voice-over (scene length follows the real recording).
      set("voice", { state: "running", detail: `0/${scenes.length}` });
      let voiced = 0;
      const voiceErrors: string[] = [];
      // One narrator for the whole video: the first take decides the voice
      // service, and every other scene asks for that same one.
      let engine: string | undefined;
      const voiceScene = async (scene: Scene) => {
        // Voice services refuse bursts ("too many requests"): wait and try again
        // with the same narrator, so one video never mixes voices.
        let out = await synthesizeProviderSpeech(sceneSpeech(scene), auto?.voice, engine, auto?.style);
        for (const wait of [3000, 8000, 15000]) {
          if (out.ok || isCancelled()) break;
          await new Promise((r) => setTimeout(r, wait));
          out = await synthesizeProviderSpeech(sceneSpeech(scene), auto?.voice, engine, auto?.style); // same narrator every time
        }
        if (out.ok && !engine) engine = out.data.model;
        if (!out.ok) {
          voiceErrors.push(out.message);
        } else {
          const dur = await audioDuration(out.data.url);
          if (dur > 0) scene.durationSec = Math.round((dur + 0.35) * 100) / 100;
          const asset = media.addAsset({
            projectId: project.id,
            sceneIds: [scene.id],
            kind: "voice",
            source: "provider-output",
            status: "ready",
            title: `Voice-over — scene ${scene.number}`,
            payload: out.data.url,
            mime: out.data.mimeType,
            durationSec: dur || undefined,
            tags: ["auto-video"],
            approval: "approved",
          });
          made.push(asset);
          void keepLocal(asset, out.data.url);
        }
        voiced += 1;
        set("voice", { detail: `${voiced}/${scenes.length}` });
      };
      // Short scripts (Shorts, promos): ONE continuous take for the whole video.
      // It flows naturally (no stop-start between scenes), keeps one narrator,
      // and is a single request instead of one per scene. Each scene then gets
      // its share of the recording in proportion to its words.
      const fullText = scenes.map((sc) => sceneSpeech(sc).trim()).filter(Boolean).join("\n\n");
      if (scenes.length > 1 && fullText.length > 0 && fullText.length <= 3500) {
        let out = await synthesizeProviderSpeech(fullText, auto?.voice, undefined, auto?.style);
        for (const wait of [3000, 8000, 15000]) {
          if (out.ok || isCancelled()) break;
          await new Promise((r) => setTimeout(r, wait));
          out = await synthesizeProviderSpeech(fullText, auto?.voice, undefined, auto?.style);
        }
        const dur = out.ok ? await audioDuration(out.data.url) : 0;
        if (out.ok && dur > 1) {
          engine = out.data.model;
          const weights = scenes.map((sc) => sceneSpeech(sc).trim().length + 12);
          const total = weights.reduce((a, b) => a + b, 0);
          let used = 0;
          scenes.forEach((sc, i) => {
            const share = i === scenes.length - 1 ? dur - used : Math.round(((dur * weights[i]) / total) * 100) / 100;
            sc.durationSec = Math.max(1, Math.round(share * 100) / 100);
            used += sc.durationSec;
          });
          scenes[scenes.length - 1].durationSec = Math.round((scenes[scenes.length - 1].durationSec + 0.35) * 100) / 100;
          const asset = media.addAsset({
            projectId: project.id,
            sceneIds: scenes.map((sc) => sc.id),
            kind: "voice",
            source: "provider-output",
            status: "ready",
            title: "Voice-over — full narration",
            payload: out.data.url,
            mime: out.data.mimeType,
            durationSec: dur,
            tags: ["auto-video", "continuous"],
            approval: "approved",
          });
          made.push(asset);
          void keepLocal(asset, out.data.url);
          voiced = scenes.length;
          set("voice", { detail: "1 continuous take" });
        }
      }
      for (const scene of scenes) {
        if (voiced >= scenes.length || engine || isCancelled()) break;
        await voiceScene(scene);
      }
      const rest = scenes.slice(voiced);
      await pool(rest, 2, isCancelled, voiceScene);
      if (isCancelled()) return false;
      // One more calm pass, one at a time, for any scene still without a voice.
      const missing = scenes.filter((sc) => !made.some((a) => a.kind === "voice" && a.sceneIds?.includes(sc.id)));
      if (missing.length) {
        voiced -= missing.length;
        voiceErrors.length = 0;
        for (const sc of missing) {
          if (isCancelled()) return false;
          await new Promise((r) => setTimeout(r, 4000));
          await voiceScene(sc);
        }
      }
      // Scenes with a voice (one continuous take covers them all).
      const voiceOk = scenes.filter((sc) => made.some((a) => a.kind === "voice" && a.sceneIds.includes(sc.id))).length;
      const continuous = made.some((a) => a.kind === "voice" && a.sceneIds.length > 1);
      set("voice", { state: voiceOk === scenes.length ? "done" : voiceOk ? "partial" : "failed", detail: voiceOk === scenes.length ? (continuous ? "1 continuous take" : `${voiceOk} takes`) : `${voiceOk}/${scenes.length} — ${voiceErrors[0] ?? "failed"}` });
      putScenes(project.id, scenes); // durations now match the voice

      // 3. Visuals: one per spoken beat, so the picture always shows what the voice is saying right now.
      // Stock footage only when its tags clearly name the beat's subject; otherwise an AI picture of exactly that.
      const beatJobs = scenes.flatMap((scene) => (beatPlan.get(scene.id) ?? []).map((b, i) => ({ scene, i, ...b })));
      set("visuals", { state: "running", detail: `0/${beatJobs.length}` });
      let drawn = 0;
      const imageErrors: string[] = [];
      const usedStock = new Set<string>();
      const orientation = vertical ? "vertical" : "horizontal";
      type BeatJob = (typeof beatJobs)[number];
      const beatTags = (job: BeatJob) => ["auto-video", beatTag(job)];
      async function stockFor(job: BeatJob): Promise<boolean> {
        const queries = [job.stockQuery, stockQuery(job.stockQuery, 2)].filter((q, i, all) => q.length >= 2 && all.indexOf(q) === i);
        for (const q of queries) {
          const res = await api
            .get<{ items: StockHit[] }>(`/api/v1/stock/search?${new URLSearchParams({ kind: "video", q, orientation, page: "1" })}`)
            .catch(() => ({ items: [] as StockHit[] }));
          // The clip's tags must name the beat's subject, not just share any word.
          for (const pick of res.items.filter((it) => !usedStock.has(it.id) && stockMatchesStrict(it.title, q))) {
            usedStock.add(pick.id);
            try {
              const file = await api.post<{ url: string; mime: string; fileSize: number }>("/api/v1/stock/import", { id: pick.id });
              made.push(
                media.addAsset({
                  projectId: project.id,
                  sceneIds: [job.scene.id],
                  kind: "video",
                  source: "provider-output",
                  status: "ready",
                  title: pick.title || `Stock — scene ${job.scene.number}`,
                  payload: file.url,
                  mime: file.mime,
                  durationSec: pick.durationSec ?? undefined,
                  width: pick.width || undefined,
                  height: pick.height || undefined,
                  fileSize: file.fileSize,
                  tags: [...beatTags(job), "stock", `stock:${pick.id}`, "license:Pixabay Content License"],
                  approval: "approved",
                }),
              );
              return true;
            } catch {
              // Try the next clip.
            }
          }
        }
        return false;
      }
      async function aiImageFor(job: BeatJob): Promise<boolean> {
        const out = await generateProviderImage(job.visual, aspect);
        if (!out.ok) {
          imageErrors.push(out.message);
          return false;
        }
        const asset = media.addAsset({
          projectId: project.id,
          sceneIds: [job.scene.id],
          kind: "image",
          source: "provider-output",
          status: "ready",
          title: `Visual — scene ${job.scene.number}.${job.i + 1}`,
          payload: out.data.url,
          mime: "image/png",
          tags: beatTags(job),
          approval: "approved",
        });
        made.push(asset);
        void keepLocal(asset, out.data.url);
        return true;
      }
      await pool(beatJobs, 3, isCancelled, async (job) => {
        const ok =
          visualMode === "ai"
            ? await aiImageFor(job)
            : (await stockFor(job)) || (await aiImageFor(job));
        if (!ok && !imageErrors.length) imageErrors.push("No matching stock clip or image could be made");
        drawn += 1;
        set("visuals", { detail: `${drawn}/${beatJobs.length}` });
      });
      if (isCancelled()) return false;

      // Paid: turn the first few AI pictures into real moving shots. A beat keeps its picture if this fails.
      let animated = 0;
      if (aiMotion && paidUser) {
        const targets = beatJobs
          .map((job) => ({ job, image: made.find((a) => a.kind === "image" && a.tags?.includes(beatTag(job)) && a.sceneIds.includes(job.scene.id)) }))
          .filter((t): t is { job: BeatJob; image: MediaAsset } => Boolean(t.image))
          .slice(0, AI_MOTION_MAX);
        let tried = 0;
        await pool(targets, 2, isCancelled, async ({ job, image }) => {
          set("visuals", { detail: `Animating ${++tried}/${targets.length}…` });
          try {
            const data = await api.post<{ url: string; mime: string; fileSize: number; seconds?: number }>("/api/v1/ai/video-clip", {
              prompt: `${job.visual}. Natural, realistic camera and subject motion.`,
              image: await toDataUrl(image.payload),
              aspect,
              seconds: 5,
            });
            const clip = media.addAsset({
              projectId: project.id,
              sceneIds: [job.scene.id],
              kind: "video",
              source: "provider-output",
              status: "ready",
              title: `AI motion — scene ${job.scene.number}.${job.i + 1}`,
              payload: data.url,
              mime: data.mime,
              durationSec: data.seconds ?? 5,
              fileSize: data.fileSize,
              tags: [...beatTags(job), "ai-clip"],
              approval: "approved",
            });
            // The moving shot leads; the still picture holds the rest of the beat.
            made.splice(made.indexOf(image), 0, clip);
            animated += 1;
          } catch {
            // Keep the still picture for this beat.
          }
        });
        if (isCancelled()) return false;
      }
      // Count scenes that have a visual, not files (a scene can have several stock clips, or a picture plus its AI motion shot).
      const visualOf = (sc: Scene) => made.filter((a) => (a.kind === "image" || a.kind === "video") && a.sceneIds.includes(sc.id));
      const imgOk = scenes.filter((sc) => visualOf(sc).length > 0).length;
      const stockScenes = scenes.filter((sc) => visualOf(sc).some((a) => a.kind === "video" && !a.tags?.includes("ai-clip"))).length;
      set("visuals", {
        state: imgOk === scenes.length ? "done" : imgOk ? "partial" : "failed",
        detail:
          imgOk === scenes.length
            ? [stockScenes && `${stockScenes} stock`, imgOk - stockScenes && `${imgOk - stockScenes} AI pictures`, animated && `${animated} AI motion`].filter(Boolean).join(" · ")
            : `${imgOk}/${scenes.length} — ${imageErrors[0] ?? "failed"}`,
      });

      // 4. Background music from the free library (optional).
      if (musicMood === "none") {
        set("music", { state: "done", detail: "Off" });
      } else {
        set("music", { state: "running" });
        let added = "";
        try {
          // A different song each video: a random page of the library, shuffled,
          // skipping tracks this device used recently.
          const recent = recentTracks();
          const page = 1 + Math.floor(Math.random() * 4);
          let found = await api.get<{ tracks: { id: string; title: string; creator: string; durationSec: number | null }[] }>(`/api/v1/music/search?mood=${encodeURIComponent(musicMood)}&page=${page}`);
          if (!found.tracks.length && page > 1) found = await api.get<typeof found>(`/api/v1/music/search?mood=${encodeURIComponent(musicMood)}&page=1`);
          const shuffled = [...found.tracks].sort(() => Math.random() - 0.5);
          const fresh = [...shuffled.filter((t) => !recent.includes(t.id)), ...shuffled.filter((t) => recent.includes(t.id))];
          for (const t of fresh.slice(0, 6)) {
            try {
              const file = await api.post<{ url: string; mime: string; fileSize: number }>("/api/v1/music/import", { id: t.id });
              const track = media.addAsset({
                projectId: project.id,
                sceneIds: [],
                kind: "music",
                source: "provider-output",
                status: "ready",
                title: `${t.title} — ${t.creator}`,
                payload: file.url,
                mime: file.mime,
                durationSec: t.durationSec ?? undefined,
                fileSize: file.fileSize,
                tags: ["auto-video", "library", `track:${t.id}`],
                approval: "approved",
              });
              made.push(track);
              added = t.title;
              rememberTrack(t.id);
              break;
            } catch {
              // Some tracks can't be used (license/size): try the next one.
            }
          }
        } catch {
          // Library busy: fall back to a built-in soundtrack below.
        }
        if (!added) {
          // Never leave a video silent: a built-in soundtrack in a matching mood, made on this device.
          const mood = MUSIC_MOODS.find((m) => m.toLowerCase() === musicMood.toLowerCase()) ?? MUSIC_MOODS.find((m) => musicMood.toLowerCase().includes(m.toLowerCase())) ?? "Corporate";
          const recipe = musicRecipe(mood, 60);
          made.push(
            media.addAsset({
              projectId: project.id,
              sceneIds: [],
              kind: "music",
              source: "local-draft",
              status: "ready",
              title: `${mood} soundtrack (built-in)`,
              payload: JSON.stringify({ mood, seconds: recipe.seconds, bpm: recipe.bpm }),
              mime: "application/x-tuberack-music",
              durationSec: recipe.seconds,
              tags: ["auto-video", "music", mood.toLowerCase()],
              approval: "approved",
            }),
          );
          added = `${mood} (built-in)`;
        }
        set("music", { state: "done", detail: added });
      }
      if (isCancelled()) return false;

      if (voiceOk === 0 && imgOk === 0) throw new Error("Neither voice-over nor visuals could be generated, so there is nothing to assemble.");

      // 5. Timeline (snapshot first if the user already had an edit).
      set("build", { state: "running" });
      if (existingClips > 0) video.saveSnapshot(project.id, "Before auto-generated video");
      const preset = presetById(vertical ? "shorts" : "youtube");
      const canvas = video.compFor(project.id).canvas;
      video.setCanvas(project.id, { ...canvas, preset: preset.id, aspect: preset.aspect, width: preset.width, height: preset.height });
      // Hold the last shot after the final word so the video doesn't stop abruptly.
      const last = scenes[scenes.length - 1];
      if (last) last.durationSec = Math.round((last.durationSec + 1.5) * 100) / 100;
      const clips = buildFromScenes(scenes, made);
      video.setClips(project.id, clips);
      built = true;
      set("build", { state: "done", detail: `${clips.length} clips · ${Math.round(scenes.reduce((n, s) => n + s.durationSec, 0))}s` });

      // 6. Thumbnail: long videos only. Shorts, TikTok and Reels show a frame
      // from the video itself, so a designed thumbnail would be wasted.
      if (vertical) {
        set("thumbnail", { state: "done", detail: "Not needed: Shorts, TikTok and Reels use a frame from the video" });
        setFinished(true);
        return true;
      }
      set("thumbnail", { state: "running" });
      try {
        const subject = production?.topic || project.topic || project.name;
        const art = await generateProviderImage(thumbnailArtPrompt(subject, production), "16:9");
        if (!art.ok) throw new Error(art.message);
        const baseSvg = await uploadToBase(art.data.url);
        const artCount = packaging.variantsFor(project.id).filter((v) => /^Art \d+/.test(v.name)).length;
        const headline = packaging.primaryTitleFor(project.id)?.text || project.name;
        packaging.addVariant(project.id, { name: `Art ${artCount + 1}`, baseKind: "upload", baseSvg, overlays: titleOverlays(headline) });
        set("thumbnail", { state: "done", detail: "Saved to Thumbnails" });
      } catch {
        set("thumbnail", { state: "partial", detail: "Couldn't make one — create it later in the Thumbnail tab" });
      }
      setFinished(true);
      return true;
    } catch (e) {
      const message = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Video generation failed.";
      fatalRef.current = message;
      setFatal(message);
      setSteps((all) => all.map((s) => (s.state === "running" ? { ...s, state: "failed" } : s)));
    } finally {
      release();
      setVideoPass(null);
      // Nothing usable was made (error or stopped before the edit was built): give the credits back.
      if (pass && !built) void api.post("/api/v1/credits/video-pass", { refund: pass }).catch(() => {});
      setRunning(false);
    }
    return false;
  }

  const needsConfirm = existingClips > 0 && !replaceOk;

  return (
    <Modal wide={finished} title={finished ? "Your video is ready" : "Generate video from script"} description={`${writable.length} scenes · ${aspect} · voice-over, visuals, music, captions${vertical ? "" : " and thumbnail"}`} onClose={() => { cancelled.current = true; onClose(); }}>
      {writable.length === 0 ? (
        <p className="text-sm text-muted-text">Write the script first — every section with text becomes a scene.</p>
      ) : (
        <div className="space-y-4">
          {existingClips > 0 && !running && !finished && (
            <label className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <input type="checkbox" checked={replaceOk} onChange={(e) => setReplaceOk(e.target.checked)} className="mt-0.5 size-4" />
              <span>
                This project’s timeline already has {existingClips} clip{existingClips === 1 ? "" : "s"}. Replace it with the generated edit?
                A snapshot is saved first — restore it any time from Snapshots in the Video Studio.
              </span>
            </label>
          )}
          {!running && !finished && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="font-medium">Format</span>
                <select value={format} onChange={(e) => setFormat(e.target.value as "long" | "short")} className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm">
                  <option value="long">Long video — landscape 16:9 (1920×1080)</option>
                  <option value="short">Short — vertical 9:16 (1080×1920)</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Visuals</span>
                <select value={visualMode} onChange={(e) => setVisualMode(e.target.value as VisualMode)} className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm">
                  <option value="mix">Stock footage + AI images (recommended)</option>
                  <option value="stock">Stock footage only</option>
                  <option value="ai">AI images only</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Background music</span>
                <select value={musicMood} onChange={(e) => setMusicMood(e.target.value)} className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm">
                  {MUSIC_MOOD_OPTIONS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                  <option value="none">No music</option>
                </select>
              </label>
              {visualMode !== "stock" && (
                <label className={cx("flex items-start gap-3 rounded-lg border border-border p-3 text-sm sm:col-span-2", paidUser ? "cursor-pointer hover:bg-muted/50" : "opacity-80")}>
                  <input
                    type="checkbox"
                    className="mt-0.5 size-5 shrink-0 accent-[var(--primary)] sm:size-4"
                    checked={aiMotion && Boolean(paidUser)}
                    disabled={!paidUser}
                    onChange={(e) => setAiMotion(e.target.checked)}
                  />
                  <span className="min-w-0 space-y-0.5">
                    <span className="flex flex-wrap items-center gap-1.5 font-medium">
                      AI motion
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        <Crown className="size-3" aria-hidden="true" /> Paid
                      </span>
                    </span>
                    <span className="block text-xs text-muted-text">
                      {paidUser
                        ? `Turns up to ${AI_MOTION_MAX} AI pictures into real moving shots. Adds a few minutes and uses video credits.`
                        : "Turn AI pictures into real moving shots. Available on paid plans."}
                    </span>
                  </span>
                </label>
              )}
            </div>
          )}
          <ol className="space-y-2">
            {steps.map((s) => (
              <li key={s.id} className="flex items-center gap-3 text-sm">
                <span className={cx("flex size-6 shrink-0 items-center justify-center rounded-full border", s.state === "done" ? "border-success bg-success/15 text-success" : s.state === "failed" ? "border-destructive text-destructive" : s.state === "partial" ? "border-warning text-warning" : "border-border text-muted-text")}>
                  {s.state === "running" ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : s.state === "done" ? <Check className="size-3.5" aria-hidden="true" /> : s.state === "failed" ? <X className="size-3.5" aria-hidden="true" /> : s.state === "partial" ? <TriangleAlert className="size-3.5" aria-hidden="true" /> : null}
                </span>
                <span className="flex-1">{s.label}</span>
                {s.detail && <span className="max-w-[55%] truncate text-xs text-muted-text" title={s.detail}>{s.detail}</span>}
              </li>
            ))}
          </ol>
          {fatal && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{fatal}</p>}
          {finished && (
            <section aria-label="Your video" className="space-y-3 rounded-xl border border-success/30 bg-success/5 p-3">
              <p className="text-sm font-semibold">Your video is ready. Watch it, post it, or fine-tune it.</p>
              <ProjectPreview projectId={project.id} />
            </section>
          )}
          {finished ? (
            // Clear hierarchy: one big main action, two equal secondary ones — labels never wrap.
            <div className="space-y-2">
              <div className="[&_button]:h-12 [&_button]:w-full [&_button]:justify-center [&_button]:gap-2 [&_button]:rounded-xl [&_button]:text-base [&_button]:font-semibold [&_button]:shadow-lg [&_button]:shadow-primary/20">
                <ProjectPublish projectId={project.id} projectName={project.name} topic={project.topic} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSaving((v) => !v)}
                  aria-pressed={saving}
                  className={cx(
                    "flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl border text-sm font-semibold transition-colors active:scale-[0.98]",
                    saving ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface hover:bg-muted",
                  )}
                >
                  <Download className="size-4 shrink-0" aria-hidden="true" /> Save to phone
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/studio/video?project=${project.id}`)}
                  className="flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-border bg-surface text-sm font-semibold transition-colors hover:bg-muted active:scale-[0.98]"
                >
                  <Clapperboard className="size-4 shrink-0" aria-hidden="true" /> Edit video
                </button>
              </div>
            </div>
          ) : (
          <div className="flex flex-wrap justify-end gap-2 max-sm:[&>*]:flex-1">
            <Button variant="outline" onClick={() => { cancelled.current = true; onClose(); }}>{running ? "Stop" : "Cancel"}</Button>
            <Button disabled={running || needsConfirm} onClick={() => void run()}>
              {running ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Clapperboard className="size-4" aria-hidden="true" />}
              {running ? "Generating…" : fatal ? "Try again" : "Generate video"}
            </Button>
          </div>
          )}
          {finished && saving && (
            <section aria-label="Save to your device" className="rounded-xl border border-border p-3">
              <p className="mb-2 text-sm font-semibold">Save to your phone or computer</p>
              <ProjectSave projectId={project.id} projectName={project.name} />
            </section>
          )}
          {!finished && <p className="text-xs text-muted-text">Takes about 1–3 minutes depending on length. Keep this screen open: switching apps can pause it.</p>}
        </div>
      )}
    </Modal>
  );
}

const RECENT_KEY = "rt-recent-music";

/** Music tracks this device used for recent videos (newest first). */
function recentTracks(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 20) : [];
  } catch {
    return [];
  }
}

function rememberTrack(id: string): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recentTracks().filter((x) => x !== id)].slice(0, 20)));
  } catch {
    // Private mode: variety still comes from the random page and shuffle.
  }
}
