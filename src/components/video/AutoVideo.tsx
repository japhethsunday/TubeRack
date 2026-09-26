"use client";

import { sceneSpeech } from "@/src/lib/script/engine";
import { useProductionContext } from "@/src/components/projects/useProductionContext";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clapperboard, Loader2, TriangleAlert, X } from "lucide-react";
import { api, ApiError } from "@/src/lib/api";
import { generateProviderImage, retryBusy, synthesizeProviderSpeech } from "@/src/lib/ai-client";
import { scenesFromSections } from "@/src/lib/script/engine";
import type { Scene, ScriptSection } from "@/src/lib/script/types";
import type { MediaAsset } from "@/src/lib/media/types";
import { buildFromScenes } from "@/src/lib/video/build";
import { presetById } from "@/src/lib/video/presets";
import { useScripts } from "@/src/components/script/ScriptProvider";
import { useMedia } from "@/src/components/media/MediaProvider";
import { useVideo } from "@/src/components/video/VideoProvider";
import { Modal } from "@/src/components/ui/overlays";
import { Button } from "@/src/components/ui/Button";
import { cx } from "@/src/components/ui/cx";
import { MUSIC_MOOD_OPTIONS } from "@/src/components/media/music-library";

type StepState = "pending" | "running" | "done" | "failed" | "partial";
interface Step {
  id: "scenes" | "voice" | "visuals" | "music" | "build";
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
];

type VisualMode = "mix" | "stock" | "ai";

const STOP = new Set("a an the of and or to in on at for with by from into over under this that these those is are was be being been as it its their his her our your my close up closeup close-up medium tight extreme over-the-shoulder wide shot shots angle view camera cinematic scene showing shows image photo realistic style lighting background foreground".split(" "));

/** A short stock-library query from a shot description ("Wide shot of a soldier in the desert" → "soldier desert"). */
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
}: {
  project: { id: string; name: string; topic: string; platform: string; contentType: string };
  sections: ScriptSection[];
  wpm: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const { putScenes } = useScripts();
  const production = useProductionContext(project.id);
  const media = useMedia();
  const video = useVideo();
  const [steps, setSteps] = useState<Step[]>(INITIAL);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [replaceOk, setReplaceOk] = useState(false);
  const [visualMode, setVisualMode] = useState<VisualMode>("mix");
  const [musicMood, setMusicMood] = useState<string>("cinematic");
  const cancelled = useRef(false);

  const vertical = project.platform === "YouTube Shorts" || project.contentType === "Short";
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

  async function run() {
    cancelled.current = false;
    setRunning(true);
    setFatal(null);
    setSteps(INITIAL);
    const isCancelled = () => cancelled.current;
    try {
      // 1. Scenes + shot list.
      set("scenes", { state: "running" });
      const scenes: Scene[] = scenesFromSections(writable, wpm).map((s) => ({ ...s, narration: s.scriptText }));
      const planned = await retryBusy(() => api.post<{ visuals: { visual: string; onScreenText: string }[] }>("/api/v1/ai/scene-visuals", {
        topic: production?.topic || project.topic || project.name,
        aspect,
        style: production?.visualStyle ?? "",
        brief: production?.brief ?? "",
        scenes: scenes.map((s) => ({ title: s.title, text: s.scriptText })),
      }));
      scenes.forEach((s, i) => {
        s.visual = planned.visuals[i]?.visual ?? s.title;
        s.onScreenText = planned.visuals[i]?.onScreenText ?? "";
      });
      putScenes(project.id, scenes);
      set("scenes", { state: "done", detail: `${scenes.length} scenes` });
      if (isCancelled()) return;

      const made: MediaAsset[] = [];

      // 2. Voice-over (scene length follows the real recording).
      set("voice", { state: "running", detail: `0/${scenes.length}` });
      let voiced = 0;
      const voiceErrors: string[] = [];
      await pool(scenes, 2, isCancelled, async (scene) => {
        const out = await synthesizeProviderSpeech(sceneSpeech(scene));
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
      });
      if (isCancelled()) return;
      const voiceOk = made.filter((a) => a.kind === "voice").length;
      set("voice", { state: voiceOk === scenes.length ? "done" : voiceOk ? "partial" : "failed", detail: voiceOk === scenes.length ? `${voiceOk} takes` : `${voiceOk}/${scenes.length} — ${voiceErrors[0] ?? "failed"}` });
      putScenes(project.id, scenes); // durations now match the voice

      // 3. Visuals: free stock footage per scene, AI images for the rest (or only one kind).
      set("visuals", { state: "running", detail: `0/${scenes.length}` });
      let drawn = 0;
      const imageErrors: string[] = [];
      const usedStock = new Set<string>();
      const orientation = vertical ? "vertical" : "horizontal";
      async function stockFor(scene: Scene): Promise<boolean> {
        const queries = [stockQuery(scene.visual, 3), stockQuery(scene.visual, 2), stockQuery(production?.topic || project.topic || project.name, 2)].filter((q, i, all) => q.length >= 2 && all.indexOf(q) === i);
        for (const q of queries) {
          const found = await api
            .get<{ items: StockHit[] }>(`/api/v1/stock/search?${new URLSearchParams({ kind: "video", q, orientation, page: "1" })}`)
            .catch(() => ({ items: [] as StockHit[] }));
          const pick = found.items.find((it) => !usedStock.has(it.id));
          if (!pick) continue;
          usedStock.add(pick.id);
          try {
            const file = await api.post<{ url: string; mime: string; fileSize: number }>("/api/v1/stock/import", { id: pick.id });
            const asset = media.addAsset({
              projectId: project.id,
              sceneIds: [scene.id],
              kind: "video",
              source: "provider-output",
              status: "ready",
              title: pick.title || `Stock — scene ${scene.number}`,
              payload: file.url,
              mime: file.mime,
              durationSec: pick.durationSec ?? undefined,
              width: pick.width || undefined,
              height: pick.height || undefined,
              fileSize: file.fileSize,
              tags: ["auto-video", "stock", `stock:${pick.id}`, "license:Pixabay Content License"],
              approval: "approved",
            });
            made.push(asset);
            return true;
          } catch {
            // Try the next query.
          }
        }
        return false;
      }
      async function aiImageFor(scene: Scene): Promise<boolean> {
        const out = await generateProviderImage(scene.visual, aspect);
        if (!out.ok) {
          imageErrors.push(out.message);
          return false;
        }
        const asset = media.addAsset({
          projectId: project.id,
          sceneIds: [scene.id],
          kind: "image",
          source: "provider-output",
          status: "ready",
          title: `Visual — scene ${scene.number}`,
          payload: out.data.url,
          mime: "image/png",
          tags: ["auto-video"],
          approval: "approved",
        });
        made.push(asset);
        void keepLocal(asset, out.data.url);
        return true;
      }
      await pool(scenes, 2, isCancelled, async (scene) => {
        // "Mix": footage for most scenes, a designed image for every third one.
        const wantStock = visualMode === "stock" || (visualMode === "mix" && scene.number % 3 !== 0);
        const ok = wantStock ? (await stockFor(scene)) || (await aiImageFor(scene)) : (await aiImageFor(scene)) || (visualMode === "mix" && (await stockFor(scene)));
        if (!ok && !imageErrors.length) imageErrors.push("No stock clip or image could be found");
        drawn += 1;
        set("visuals", { detail: `${drawn}/${scenes.length}` });
      });
      if (isCancelled()) return;
      const clipsOk = made.filter((a) => a.kind === "video").length;
      const imgOk = made.filter((a) => a.kind === "image").length + clipsOk;
      set("visuals", {
        state: imgOk === scenes.length ? "done" : imgOk ? "partial" : "failed",
        detail: imgOk === scenes.length ? `${clipsOk} stock clips · ${imgOk - clipsOk} images` : `${imgOk}/${scenes.length} — ${imageErrors[0] ?? "failed"}`,
      });

      // 4. Background music from the free library (optional).
      if (musicMood === "none") {
        set("music", { state: "done", detail: "Off" });
      } else {
        set("music", { state: "running" });
        let added = "";
        try {
          const found = await api.get<{ tracks: { id: string; title: string; creator: string; durationSec: number | null }[] }>(`/api/v1/music/search?mood=${encodeURIComponent(musicMood)}&page=1`);
          for (const t of found.tracks.slice(0, 5)) {
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
              break;
            } catch {
              // Some tracks can't be used (license/size): try the next one.
            }
          }
        } catch {
          // Library busy: the video is still made, without music.
        }
        set("music", added ? { state: "done", detail: added } : { state: "partial", detail: "Couldn't add music — add it later from the Music tab" });
      }
      if (isCancelled()) return;

      if (voiceOk === 0 && imgOk === 0) throw new Error("Neither voice-over nor visuals could be generated, so there is nothing to assemble.");

      // 5. Timeline (snapshot first if the user already had an edit).
      set("build", { state: "running" });
      if (existingClips > 0) video.saveSnapshot(project.id, "Before auto-generated video");
      const preset = presetById(vertical ? "shorts" : "youtube");
      const canvas = video.compFor(project.id).canvas;
      video.setCanvas(project.id, { ...canvas, preset: preset.id, aspect: preset.aspect, width: preset.width, height: preset.height });
      const clips = buildFromScenes(scenes, made);
      video.setClips(project.id, clips);
      set("build", { state: "done", detail: `${clips.length} clips · ${Math.round(scenes.reduce((n, s) => n + s.durationSec, 0))}s` });
      setFinished(true);
    } catch (e) {
      setFatal(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Video generation failed.");
      setSteps((all) => all.map((s) => (s.state === "running" ? { ...s, state: "failed" } : s)));
    } finally {
      setRunning(false);
    }
  }

  const needsConfirm = existingClips > 0 && !replaceOk;

  return (
    <Modal title="Generate video from script" description={`${writable.length} scenes · ${aspect} · voice-over, visuals, music and captions`} onClose={() => { cancelled.current = true; onClose(); }}>
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
          <div className="flex justify-end gap-2">
            {finished ? (
              <Button onClick={() => router.push(`/studio/video?project=${project.id}`)}>
                <Clapperboard className="size-4" aria-hidden="true" /> Open in Video Studio
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => { cancelled.current = true; onClose(); }}>{running ? "Stop" : "Cancel"}</Button>
                <Button disabled={running || needsConfirm} onClick={() => void run()}>
                  {running ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Clapperboard className="size-4" aria-hidden="true" />}
                  {running ? "Generating…" : fatal ? "Try again" : "Generate video"}
                </Button>
              </>
            )}
          </div>
          {!finished && <p className="text-xs text-muted-text">Takes about 1–3 minutes depending on length. Keep this tab open.</p>}
        </div>
      )}
    </Modal>
  );
}
