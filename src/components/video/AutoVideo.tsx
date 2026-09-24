"use client";

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

type StepState = "pending" | "running" | "done" | "failed" | "partial";
interface Step {
  id: "scenes" | "voice" | "visuals" | "build";
  label: string;
  state: StepState;
  detail: string;
}

const INITIAL: Step[] = [
  { id: "scenes", label: "Plan scenes and shots", state: "pending", detail: "" },
  { id: "voice", label: "Record voice-over", state: "pending", detail: "" },
  { id: "visuals", label: "Generate visuals", state: "pending", detail: "" },
  { id: "build", label: "Assemble the timeline", state: "pending", detail: "" },
];

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
  const media = useMedia();
  const video = useVideo();
  const [steps, setSteps] = useState<Step[]>(INITIAL);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [replaceOk, setReplaceOk] = useState(false);
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
        topic: project.topic || project.name,
        aspect,
        style: "",
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
        const out = await synthesizeProviderSpeech(scene.narration);
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

      // 3. Visuals.
      set("visuals", { state: "running", detail: `0/${scenes.length}` });
      let drawn = 0;
      const imageErrors: string[] = [];
      await pool(scenes, 2, isCancelled, async (scene) => {
        const out = await generateProviderImage(scene.visual, aspect);
        if (!out.ok) {
          imageErrors.push(out.message);
        } else {
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
        }
        drawn += 1;
        set("visuals", { detail: `${drawn}/${scenes.length}` });
      });
      if (isCancelled()) return;
      const imgOk = made.filter((a) => a.kind === "image").length;
      set("visuals", { state: imgOk === scenes.length ? "done" : imgOk ? "partial" : "failed", detail: imgOk === scenes.length ? `${imgOk} images` : `${imgOk}/${scenes.length} — ${imageErrors[0] ?? "failed"}` });
      if (voiceOk === 0 && imgOk === 0) throw new Error("Neither voice-over nor visuals could be generated, so there is nothing to assemble.");

      // 4. Timeline (snapshot first if the user already had an edit).
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
    <Modal title="Generate video from script" description={`${writable.length} scenes · ${aspect} · voice-over, visuals and captions`} onClose={() => { cancelled.current = true; onClose(); }}>
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
