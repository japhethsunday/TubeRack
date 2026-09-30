"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Loader2 } from "lucide-react";
import { api } from "@/src/lib/api";
import { useVideo } from "@/src/components/video/VideoProvider";
import { useMedia } from "@/src/components/media/MediaProvider";
import { useScripts } from "@/src/components/script/ScriptProvider";
import { GenerateVideoDialog } from "@/src/components/video/AutoVideo";
import { PublishDialog } from "@/src/components/video/PublishToYouTube";
import { sizeFor } from "@/src/components/video/ExportStudio";
import { localSlot, releaseAt, type ReleaseTime } from "@/src/lib/video/publish";
import { renderComposition } from "@/src/lib/video/render";
import { uploadToCloud } from "@/src/lib/media/cloud-upload";
import type { Composition } from "@/src/lib/video/types";
import { durationOf, healthOf, validateComposition } from "@/src/lib/video/build";
import type { RenderAsset } from "@/src/lib/video/render";

export type AutoPlatform = "yt" | "tt";

/** Promo videos keep one professional brand narrator, delivered like a confident creator. */
const PROMO_SOUND = { voice: "Achird", style: "energetic" };
/** Polished, upbeat beds that suit a product video; rotated so promos don't all sound alike. */
const PROMO_MUSIC = ["corporate", "motivational", "inspirational", "cinematic"];
import type { ScriptSection } from "@/src/lib/script/types";

interface Promo { id: string; projectId: string | null; pkg: { title: string; captions: { platform: string; title: string; caption: string; hashtags: string[] }[] } }

/**
 * Hands-free promo posting (started by the admin assistant). For the promo in
 * ?autopost=, generate the video, render it and upload it to the connected
 * YouTube channel, save the link, then move on to the next id in ?queue=.
 * Runs in this tab: it only needs to stay open.
 */
export function AutopilotRunner({
  project,
  sections,
  wpm,
  promoId,
  queue,
  index = 0,
  when = "now",
  startInDays = 0,
  platforms = ["yt"],
}: {
  project: { id: string; name: string; topic: string; platform: string; contentType: string };
  sections: ScriptSection[];
  wpm: number;
  promoId: string;
  queue: string[];
  /** Position in the batch: 0 posts now, the rest are scheduled one per day. */
  index?: number;
  /** Time of day in the viewer's local time; "now" posts the first at once. */
  when?: ReleaseTime;
  startInDays?: number;
  platforms?: AutoPlatform[];
}) {
  const [stage, setStage] = useState<"generate" | "publish" | "next" | "failed">("generate");
  const [promo, setPromo] = useState<Promo | null>(null);
  const [error, setError] = useState("");
  const total = index + queue.length + 1;
  const releaseDate = useMemo(() => releaseAt(index, when, startInDays), [index, when, startInDays]);
  const slot = localSlot(releaseDate);
  const yt = platforms.includes("yt");
  const tt = platforms.includes("tt");

  // The prepared title, caption and hashtags for YouTube.
  useEffect(() => {
    const fallback = { id: promoId, projectId: project.id, pkg: { title: project.name, captions: [] } };
    api
      .get<{ promos: Promo[] }>("/api/v1/admin/promo")
      .then((d) => setPromo(d.promos.find((p) => p.id === promoId) ?? fallback))
      .catch(() => setPromo(fallback));
  }, [promoId, project.id, project.name]);

  async function goNext() {
    setStage("next");
    if (!queue.length) {
      window.location.assign("/admin/promo?posted=1");
      return;
    }
    const [nextId, ...rest] = queue;
    try {
      const d = await api.get<{ promos: Promo[] }>("/api/v1/admin/promo");
      let projectId = d.promos.find((p) => p.id === nextId)?.projectId ?? null;
      if (!projectId) projectId = (await api.post<{ projectId: string }>(`/api/v1/admin/promo/${nextId}`, { action: "project" })).projectId;
      const q = new URLSearchParams({ project: projectId, autopost: nextId, n: String(index + 1), at: when, start: String(startInDays), pf: platforms.join(",") });
      if (rest.length) q.set("queue", rest.join(","));
      window.location.assign(`/studio/video?${q}`);
    } catch {
      window.location.assign("/admin/promo?posted=1");
    }
  }

  async function fail(message: string) {
    setError(message);
    setStage("failed");
    await api.post(`/api/v1/admin/promo/${promoId}`, { action: "failed", message: message.slice(0, 400) }).catch(() => undefined);
    // Carry on with the rest: one bad video shouldn't stop the batch.
    window.setTimeout(() => void goNext(), 4000);
  }

  const ytCap = promo?.pkg.captions.find((c) => c.platform === "YouTube Shorts") ?? promo?.pkg.captions[0];
  const ttCap = promo?.pkg.captions.find((c) => /tiktok/i.test(c.platform)) ?? ytCap;
  const tiktokCaption = ttCap ? `${ttCap.caption} ${ttCap.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}`.trim() : promo?.pkg.title ?? project.name;
  const where = [yt && "YouTube", tt && "TikTok"].filter(Boolean).join(" and ");

  return (
    <>
      <div role="status" className="fixed inset-x-0 top-0 z-[80] flex items-center justify-center gap-2 bg-gradient-to-r from-fuchsia-600 via-violet-600 to-sky-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
        {stage === "failed" ? <Bot className="size-4" aria-hidden="true" /> : <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        <span>
          Autopilot · video {index + 1} of {total} ·{" "}
          {stage === "generate" ? "making the video" : stage === "publish" ? (releaseDate ? `scheduling on ${where} for ${releaseDate.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}` : `posting to ${where}`) : stage === "next" ? "moving on" : `skipped: ${error}`}
          {" "}· keep this tab open
        </span>
      </div>
      {stage === "generate" && (
        <GenerateVideoDialog project={project} sections={sections} wpm={wpm} onClose={() => undefined} auto={{ onDone: () => setStage("publish"), onFail: (m) => void fail(m), ...PROMO_SOUND, music: PROMO_MUSIC[(index + promoId.charCodeAt(0)) % PROMO_MUSIC.length] }} />
      )}
      {stage === "publish" && promo && (
        <AutoPublish
          projectId={project.id}
          projectName={project.name}
          topic={project.topic}
          title={ytCap?.title || promo.pkg.title}
          description={ytCap ? `${ytCap.caption}\n\n${ytCap.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}\n\nMade with Recktube: https://www.recktube.xyz` : promo.pkg.title}
          tags={(ytCap?.hashtags ?? []).map((h) => h.replace(/^#/, ""))}
          scheduleAt={slot}
          youtube={yt}
          tiktok={tt ? { caption: tiktokCaption, postAt: releaseDate ? releaseDate.toISOString() : "", promoId } : null}
          onDone={async (videoId, note) => {
            if (videoId) await api.post(`/api/v1/admin/promo/${promoId}`, { action: "posted", videoId, ...(releaseDate && yt ? { scheduledFor: releaseDate.toISOString() } : {}), ...(note ? { note: note.slice(0, 400) } : {}) }).catch(() => undefined);
            if (note) {
              setError(note);
              setStage("failed");
              window.setTimeout(() => void goNext(), 4000);
              return;
            }
            void goNext();
          }}
          onFail={(m) => void fail(m)}
        />
      )}
    </>
  );
}

/** Same render + upload as the Publish button, filled in and started automatically. */
function AutoPublish(props: { projectId: string; projectName: string; topic: string; title: string; description: string; tags: string[]; scheduleAt: string; youtube: boolean; tiktok: { caption: string; postAt: string; promoId: string } | null; onDone: (videoId: string, note?: string) => void; onFail: (m: string) => void }) {
  const [rendered, setRendered] = useState<{ blob: Blob; mime: string } | null>(null);
  const [ytDone, setYtDone] = useState<string | null>(null);
  const video = useVideo();
  const media = useMedia();
  const scripts = useScripts();
  const comp = video.ready ? video.compFor(props.projectId) : null;
  const assets = useMemo(() => media.assetsFor(props.projectId), [media, props.projectId]);
  const scenes = useMemo(() => scripts.scenesFor(props.projectId), [scripts, props.projectId]);
  // Load this device's copies of the music, voice and pictures first (like the Publish button),
  // so the render never leaves out the soundtrack.
  const { want } = media;
  useEffect(() => {
    if (assets.length) want(assets.map((a) => a.id));
  }, [assets, want]);
  const [settled, setSettled] = useState(false);
  const [waitedLong, setWaitedLong] = useState(false);
  useEffect(() => {
    const a = window.setTimeout(() => setSettled(true), 4000);
    // Never wait forever: after 30s render with what loaded.
    const b = window.setTimeout(() => setWaitedLong(true), 30_000);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, []);
  const missingAudio = !waitedLong && assets.some((a) => (a.kind === "music" || a.kind === "voice") && a.source === "local-draft" && !media.blobUrlFor(a.id));
  if (!comp || comp.clips.length === 0 || !media.ready || !scripts.ready || !settled || missingAudio) {
    return <p className="fixed bottom-4 left-1/2 z-[80] -translate-x-1/2 rounded-lg bg-black/80 px-3 py-2 text-xs text-white">Preparing the video…</p>;
  }
  const issues = validateComposition(comp, scenes, assets);
  const assetFor = (assetId: string | undefined): RenderAsset | null => {
    const a = assets.find((x) => x.id === assetId);
    return a ? { kind: a.kind, source: a.source, payload: a.payload, mime: a.mime, title: a.title, blobUrl: media.blobUrlFor(a.id), durationSec: a.durationSec } : null;
  };
  const source = {
        projectId: props.projectId,
        projectName: props.projectName,
        topic: props.topic,
        comp,
        duration: durationOf(comp.clips),
        fps: 30,
        health: healthOf(issues),
        blockingIssues: issues.filter((i) => i.severity === "block").map((i) => i.message),
        assetFor,
        render: { ...sizeFor(comp, 1080), fps: 30 },
      };
  // TikTok after YouTube (reusing its render), or on its own.
  if (props.tiktok && (!props.youtube || ytDone !== null)) {
    return <TikTokStep comp={comp} duration={source.duration} render={source.render} assetFor={assetFor} projectId={props.projectId} prerendered={rendered} job={props.tiktok} onDone={() => props.onDone(ytDone ?? "")} onFail={(m) => (ytDone ? props.onDone(ytDone, `On YouTube, but ${m}`) : props.onFail(m))} />;
  }
  return (
    <PublishDialog
      source={{
        projectId: props.projectId,
        projectName: props.projectName,
        topic: props.topic,
        comp,
        duration: durationOf(comp.clips),
        fps: 30,
        health: healthOf(issues),
        blockingIssues: issues.filter((i) => i.severity === "block").map((i) => i.message),
        assetFor,
        render: { ...sizeFor(comp, 1080), fps: 30 },
      }}
      prerendered={null}
      onClose={() => undefined}
      onRendered={setRendered}
      auto={{ title: props.title, description: props.description, tags: props.tags, scheduleAt: props.scheduleAt, onDone: (id) => (props.tiktok ? setYtDone(id) : props.onDone(id)), onFail: props.onFail }}
    />
  );
}

/** Upload the finished video and queue it for TikTok at its time (TikTok has no scheduling of its own). */
function TikTokStep(props: {
  comp: Composition;
  duration: number;
  render: { width: number; height: number; fps: number };
  assetFor: (id: string | undefined) => RenderAsset | null;
  projectId: string;
  prerendered: { blob: Blob; mime: string } | null;
  job: { caption: string; postAt: string; promoId: string };
  onDone: () => void;
  onFail: (m: string) => void;
}) {
  const [msg, setMsg] = useState("Preparing the TikTok video…");
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        let video = props.prerendered;
        if (!video) {
          setMsg("Rendering for TikTok…");
          const out = await renderComposition({ comp: props.comp, duration: props.duration, ...props.render, assetFor: props.assetFor, onProgress: (p) => setMsg(`Rendering for TikTok… ${Math.round(p.ratio * 100)}%`) });
          video = { blob: out.blob, mime: out.mime };
        }
        setMsg("Uploading for TikTok…");
        const { fileUrl } = await uploadToCloud(video.blob, video.mime.split(";")[0] || "video/mp4", (r) => setMsg(`Uploading for TikTok… ${Math.round(r * 100)}%`));
        setMsg(props.job.postAt ? "Scheduling on TikTok…" : "Posting to TikTok…");
        await api.post("/api/v1/admin/promo/tiktok", { fileUrl, caption: props.job.caption, postAt: props.job.postAt, projectId: props.projectId, promoId: props.job.promoId });
        props.onDone();
      } catch (error) {
        props.onFail(`TikTok: ${error instanceof Error ? error.message : "couldn't schedule the post"}`);
      }
    })();
  }, [props]);
  return <p className="fixed bottom-4 left-1/2 z-[80] -translate-x-1/2 rounded-lg bg-black/80 px-3 py-2 text-xs text-white">{msg}</p>;
}
