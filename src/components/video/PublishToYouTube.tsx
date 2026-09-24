"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  MonitorPlay,
  Check,
  X,
  Loader2,
  Circle,
  MinusCircle,
  RotateCcw,
  ExternalLink,
  Copy,
  Clapperboard,
  UploadCloud,
  ImageIcon,
  Captions,
  ListVideo,
  Cog,
  Film,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { growth, type PublishRecord } from "@/src/lib/growth-client";
import { usePackaging } from "@/src/components/package/PackagingProvider";
import { composeThumbnail } from "@/src/lib/package/thumbnails";
import { renderComposition, renderSupport, RenderError, type RenderAsset } from "@/src/lib/video/render";
import { uploadResumable, UploadError } from "@/src/lib/youtube-upload";
import {
  YT_CATEGORIES,
  YT_DESCRIPTION_MAX,
  YT_TITLE_MAX,
  buildDescription,
  buildVtt,
  categoryId,
  clampTitle,
  languageCode,
  normalizeTags,
  scheduleError,
} from "@/src/lib/video/publish";
import type { Composition, HealthState } from "@/src/lib/video/types";
import { Modal } from "@/src/components/ui/overlays";
import { Button } from "@/src/components/ui/Button";
import { Input, Select, Textarea } from "@/src/components/ui/fields";
import { Badge } from "@/src/components/ui/Badge";
import { downloadBlob } from "@/src/lib/download";
import { cx } from "@/src/components/ui/cx";

type StepId = "render" | "upload" | "thumbnail" | "playlist" | "processing" | "captions";
type StepState = "pending" | "active" | "done" | "skipped" | "failed";

interface Step {
  id: StepId;
  label: string;
  state: StepState;
  detail: string;
  progress: number | null;
}

const STEP_META: Record<StepId, { label: string; icon: typeof Film }> = {
  render: { label: "Render video", icon: Clapperboard },
  upload: { label: "Upload to YouTube", icon: UploadCloud },
  thumbnail: { label: "Set thumbnail", icon: ImageIcon },
  playlist: { label: "Add to playlist", icon: ListVideo },
  processing: { label: "YouTube processing", icon: Cog },
  captions: { label: "Upload captions", icon: Captions },
};

const ORDER: StepId[] = ["render", "upload", "thumbnail", "playlist", "processing", "captions"];

async function svgToImage(svg: string): Promise<{ mime: "image/png" | "image/jpeg"; base64: string; url: string }> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable.");
    ctx.drawImage(img, 0, 0, 1280, 720);
    // PNG first; fall back to JPEG to stay under YouTube's 2 MB limit.
    let mime: "image/png" | "image/jpeg" = "image/png";
    let dataUrl = canvas.toDataURL(mime);
    if (dataUrl.length * 0.75 > 1.9 * 1024 * 1024) {
      mime = "image/jpeg";
      dataUrl = canvas.toDataURL(mime, 0.9);
    }
    return { mime, base64: dataUrl.split(",")[1], url: dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fmtMb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

export interface PublishSource {
  projectId: string;
  projectName: string;
  comp: Composition;
  duration: number;
  fps: number;
  health: HealthState;
  blockingIssues: string[];
  assetFor: (id: string | undefined) => RenderAsset | null;
  /** Export size used when publishing renders the timeline itself. */
  render?: { width: number; height: number; fps: number };
}

export interface Prerendered {
  blob: Blob;
  mime: string;
}

/** Header button + latest published state for the current project. */
export function PublishButton({ source, prerendered, openSignal }: { source: PublishSource; prerendered?: Prerendered | null; openSignal?: number }) {
  const [open, setOpen] = useState(false);
  // Opening from the Export panel bumps openSignal.
  const [lastSignal, setLastSignal] = useState(openSignal ?? 0);
  if ((openSignal ?? 0) !== lastSignal) {
    setLastSignal(openSignal ?? 0);
    if (openSignal) setOpen(true);
  }
  const [latest, setLatest] = useState<PublishRecord | null>(null);

  useEffect(() => {
    void growth.publishes(source.projectId).then((o) => o.ok && setLatest(o.data[0] ?? null));
  }, [source.projectId, open]);

  return (
    <>
      {latest?.video_id && (latest.status === "published" || latest.status === "scheduled") && (
        <a
          href={`https://youtu.be/${latest.video_id}`}
          target="_blank"
          rel="noreferrer"
          className="hidden items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-success hover:bg-muted sm:inline-flex"
          title={latest.title}
        >
          <Check className="size-3.5" aria-hidden="true" /> {latest.status === "scheduled" ? "Scheduled" : "Published"} on YouTube
        </a>
      )}
      <Button size="sm" onClick={() => setOpen(true)}>
        <MonitorPlay className="size-4" aria-hidden="true" /> Publish to YouTube
      </Button>
      {open && <PublishDialog source={source} prerendered={prerendered ?? null} onClose={() => setOpen(false)} />}
    </>
  );
}

function PublishDialog({ source, prerendered, onClose }: { source: PublishSource; prerendered: Prerendered | null; onClose: () => void }) {
  const pack = usePackaging();
  const seo = pack.seoFor(source.projectId);
  const primary = pack.primaryTitleFor(source.projectId);
  // Approved thumbnail first, else the newest variant that has its artwork embedded.
  const approved = pack.approvedVariantFor(source.projectId);
  const variant = (approved?.baseSvg ? approved : null) ?? pack.variantsFor(source.projectId).filter((v) => v.baseSvg).slice(-1)[0] ?? null;
  const hiddenTracks = useMemo(() => new Set(source.comp.tracks.filter((t) => t.hidden).map((t) => t.id)), [source.comp.tracks]);
  const vtt = useMemo(() => buildVtt(source.comp.clips.filter((c) => !hiddenTracks.has(c.trackId))), [source.comp.clips, hiddenTracks]);
  const cueCount = vtt ? (vtt.match(/-->/g) ?? []).length : 0;

  // ---- Connection + review fields (prefilled from the production). ----
  const [conn, setConn] = useState<{ connected: boolean; canManage: boolean; channel: string } | null>(null);
  const [playlists, setPlaylists] = useState<{ id: string; title: string }[]>([]);
  const [title, setTitle] = useState(clampTitle(primary?.text || source.projectName));
  const [description, setDescription] = useState(() => buildDescription({ description: seo.description, chapters: seo.chapters, hashtags: seo.hashtags }));
  const [tags, setTags] = useState(() => normalizeTags([...seo.tags, ...seo.keywords]).join(", "));
  const [category, setCategory] = useState(categoryId(seo.category));
  const [language, setLanguage] = useState(languageCode(seo.language || "English"));
  const [privacy, setPrivacy] = useState<"public" | "unlisted" | "private">("public");
  const [schedule, setSchedule] = useState("");
  const [playlistId, setPlaylistId] = useState("");
  const [includeThumb, setIncludeThumb] = useState(Boolean(variant));
  const [includeCaptions, setIncludeCaptions] = useState(cueCount > 0);
  const [madeForKids, setMadeForKids] = useState(false);
  const [synthetic, setSynthetic] = useState(true);
  const [notify, setNotify] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    void (async () => {
      const c = await growth.connection();
      if (!c.ok || !c.data.connection) {
        setConn({ connected: false, canManage: false, channel: "" });
        return;
      }
      setConn({ connected: true, canManage: c.data.canManage, channel: c.data.connection.channelTitle });
      const p = await growth.playlists();
      if (p.ok) setPlaylists(p.data);
    })();
  }, []);

  useEffect(() => {
    if (!variant) return;
    void svgToImage(composeThumbnail(variant.baseSvg ?? "", variant.overlays)).then((t) => setThumbPreview(t.url)).catch(() => setThumbPreview(null));
  }, [variant]);

  // ---- Run state (kept in refs so Retry resumes instead of restarting). ----
  const [phase, setPhase] = useState<"review" | "running" | "done" | "failed">("review");
  const [steps, setSteps] = useState<Step[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [result, setResult] = useState<{ videoId: string; scheduled: string | null; stillProcessing: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const run = useRef<{ blob: Blob | null; mime: string; sessionUrl: string | null; videoId: string | null; recordId: string | null; abort: AbortController | null; stillProcessing: boolean }>({
    stillProcessing: false,
    blob: null,
    mime: "",
    sessionUrl: null,
    videoId: null,
    recordId: null,
    abort: null,
  });

  const setStep = (id: StepId, patch: Partial<Step>) => setSteps((all) => all.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const stepsRef = useRef<Step[]>([]);
  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);

  const renderBlocked = !file && !prerendered && source.health === "blocked";
  const scheduleProblem = privacy === "public" || schedule ? scheduleError(schedule) : null;

  function validate(): string | null {
    if (!title.trim()) return "Add a title.";
    if (description.length > YT_DESCRIPTION_MAX) return `Description is over ${YT_DESCRIPTION_MAX} characters.`;
    if (scheduleProblem) return scheduleProblem;
    if (renderBlocked) return "The timeline has blocking issues (see the Export tab). Fix them, or choose a finished video file instead.";
    if (!file && !prerendered && !renderSupport().ok) return renderSupport().reason ?? "Rendering isn't supported in this browser.";
    return null;
  }

  async function saveRecord(status: PublishRecord["status"], error: string | null = null) {
    const stepMap = Object.fromEntries(stepsRef.current.map((s) => [s.id, s.state]));
    const o = await growth.savePublish({
      id: run.current.recordId ?? undefined,
      projectId: source.projectId,
      videoId: run.current.videoId,
      title: clampTitle(title),
      privacy,
      publishAt: schedule ? new Date(schedule).toISOString() : null,
      status,
      steps: stepMap,
      error,
    });
    if (o.ok && o.data) run.current.recordId = o.data.id;
  }

  async function start() {
    const problem = validate();
    if (problem) return setFormError(problem);
    setFormError("");
    const wantPlaylist = Boolean(playlistId);
    const initial: Step[] = ORDER.map((id) => {
      let state: StepState = "pending";
      let detail = "";
      if (id === "render" && file) [state, detail] = ["skipped", "Using your video file"];
      if (id === "render" && !file && prerendered) {
        run.current.blob = prerendered.blob;
        run.current.mime = prerendered.mime;
        [state, detail] = ["done", `Using your export · ${fmtMb(prerendered.blob.size)}`];
      }
      if (id === "thumbnail" && !(includeThumb && variant)) [state, detail] = ["skipped", variant ? "Turned off" : "No thumbnail in Packaging — YouTube will pick one"];
      if (id === "playlist" && !wantPlaylist) [state, detail] = ["skipped", "No playlist selected"];
      if (id === "captions" && !(includeCaptions && vtt)) [state, detail] = ["skipped", vtt ? "Turned off" : "No captions on the timeline"];
      if ((id === "playlist" || id === "captions") && state === "pending" && !conn?.canManage) [state, detail] = ["skipped", "Needs the playlists & captions permission"];
      return { id, label: STEP_META[id].label, state, detail, progress: null };
    });
    setSteps(initial);
    stepsRef.current = initial;
    setWarnings([]);
    setPhase("running");
    await execute();
  }

  async function execute() {
    const ac = new AbortController();
    run.current.abort = ac;
    const r = run.current;
    const next = () => stepsRef.current.find((s) => s.state === "pending" || s.state === "failed" || s.state === "active");
    try {
      for (let s = next(); s; s = next()) {
        setStep(s.id, { state: "active", detail: "", progress: null });
        stepsRef.current = stepsRef.current.map((x) => (x.id === s!.id ? { ...x, state: "active" } : x));
        const finish = (detail = "") => {
          setStep(s!.id, { state: "done", detail, progress: null });
          stepsRef.current = stepsRef.current.map((x) => (x.id === s!.id ? { ...x, state: "done" } : x));
        };

        if (s.id === "render") {
          if (!r.blob) {
            const out = await renderComposition({
              comp: source.comp,
              duration: source.duration,
              width: source.render?.width ?? source.comp.canvas.width,
              height: source.render?.height ?? source.comp.canvas.height,
              fps: source.render?.fps ?? source.fps,
              assetFor: source.assetFor,
              signal: ac.signal,
              onProgress: (p) => setStep("render", { progress: Math.round(p.ratio * 100), detail: p.message }),
            });
            r.blob = out.blob;
            r.mime = out.mime;
            setWarnings(out.warnings);
          }
          finish(`${fmtMb(r.blob.size)} ${r.mime.includes("mp4") ? "MP4" : "WebM"}`);
        }

        if (s.id === "upload") {
          const body = file ?? r.blob;
          if (!body) throw new Error("No video to upload.");
          const resuming = Boolean(r.sessionUrl);
          if (!r.sessionUrl) {
            const session = await growth.startUpload({
              title: clampTitle(title),
              description,
              tags: normalizeTags(tags.split(",")),
              categoryId: category,
              privacy,
              publishAt: schedule ? new Date(schedule).toISOString() : null,
              madeForKids,
              size: body.size,
              mime: (file?.type || r.mime || "video/mp4").split(";")[0],
              defaultLanguage: language,
              containsSyntheticMedia: synthetic,
              notifySubscribers: notify,
            });
            if (!session.ok) throw new Error(session.message);
            r.sessionUrl = session.data.uploadUrl;
            await saveRecord("uploading");
          }
          const started = Date.now();
          const video = await uploadResumable(r.sessionUrl!, body, {
            resume: resuming,
            signal: ac.signal,
            onProgress: (sent, total) => {
              const secs = (Date.now() - started) / 1000;
              const rate = secs > 1 ? sent / secs : 0;
              const eta = rate > 0 ? Math.round((total - sent) / rate) : null;
              setStep("upload", { progress: Math.round((sent / total) * 100), detail: `${fmtMb(sent)} of ${fmtMb(total)}${eta !== null && sent < total ? ` · ~${eta < 60 ? `${eta}s` : `${Math.ceil(eta / 60)} min`} left` : ""}` });
            },
          });
          r.videoId = video.id;
          finish(`Video ID ${video.id}`);
          await saveRecord("processing");
        }

        if (s.id === "thumbnail") {
          if (!variant || !r.videoId) throw new Error("Nothing to set.");
          const img = await svgToImage(composeThumbnail(variant.baseSvg ?? "", variant.overlays));
          const o = await growth.publishStep({ step: "thumbnail", videoId: r.videoId, mime: img.mime, base64: img.base64 });
          if (!o.ok) throw new Error(o.message);
          finish(variant.name);
        }

        if (s.id === "playlist") {
          const o = await growth.publishStep({ step: "playlist", videoId: r.videoId, playlistId });
          if (!o.ok) throw new Error(o.message);
          finish(playlists.find((p) => p.id === playlistId)?.title ?? "");
        }

        if (s.id === "processing") {
          // Poll up to ~10 minutes; after that YouTube keeps going on its own.
          let status = "";
          for (let i = 0; i < 120; i++) {
            const o = await growth.videoStatus(r.videoId!);
            if (o.ok) {
              const v = o.data;
              status = v.processingStatus ?? v.uploadStatus;
              if (v.uploadStatus === "rejected" || v.uploadStatus === "failed" || v.processingStatus === "failed" || v.processingStatus === "terminated") {
                throw new Error(`YouTube couldn't process the video: ${v.rejectionReason || v.failureReason || status}.`);
              }
              if (v.processingStatus === "succeeded" || v.uploadStatus === "processed") break;
              const pp = v.processingProgress;
              const ratio = pp?.partsTotal ? (pp.partsProcessed ?? 0) / pp.partsTotal : null;
              setStep("processing", {
                progress: ratio !== null ? Math.round(ratio * 100) : null,
                detail: pp?.timeLeftMs ? `About ${Math.max(1, Math.round(pp.timeLeftMs / 60000))} min left` : "YouTube is processing your video…",
              });
            }
            if (ac.signal.aborted) throw new UploadError("Cancelled.", false);
            await sleep(5000);
          }
          const done = status === "succeeded" || status === "processed";
          r.stillProcessing = !done;
          finish(done ? "Processed" : "Still processing — it will finish on YouTube");
        }

        if (s.id === "captions") {
          const o = await growth.publishStep({ step: "captions", videoId: r.videoId, language, name: "", vtt });
          if (!o.ok) throw new Error(o.message);
          finish(`${cueCount} lines`);
        }
      }
      setResult({ videoId: r.videoId!, scheduled: schedule || null, stillProcessing: r.stillProcessing });
      await saveRecord(schedule ? "scheduled" : "published");
      setPhase("done");
    } catch (error) {
      const message =
        error instanceof RenderError || error instanceof UploadError || error instanceof Error ? error.message : "Something went wrong.";
      const active = stepsRef.current.find((x) => x.state === "active");
      if (active) {
        setStep(active.id, { state: "failed", detail: message, progress: null });
        stepsRef.current = stepsRef.current.map((x) => (x.id === active.id ? { ...x, state: "failed" } : x));
      }
      await saveRecord("failed", message.slice(0, 480)).catch(() => undefined);
      setPhase("failed");
    } finally {
      run.current.abort = null;
    }
  }

  function skipFailed() {
    const failed = stepsRef.current.find((s) => s.state === "failed");
    if (!failed || failed.id === "render" || failed.id === "upload") return;
    setStep(failed.id, { state: "skipped", detail: "Skipped after an error" });
    stepsRef.current = stepsRef.current.map((x) => (x.id === failed.id ? { ...x, state: "skipped" } : x));
    setPhase("running");
    void execute();
  }

  const failedStep = steps.find((s) => s.state === "failed");
  const url = result ? `https://youtu.be/${result.videoId}` : "";

  return (
    <Modal
      title={phase === "done" ? "Published to YouTube" : "Publish to YouTube"}
      description={conn?.channel ? `Channel: ${conn.channel}` : undefined}
      onClose={() => {
        if (phase === "running" && !confirm("Stop publishing? Rendering or uploading will be cancelled.")) return;
        run.current.abort?.abort();
        onClose();
      }}
      wide
    >
      {conn === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-text"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Checking your YouTube connection…</p>
      ) : !conn.connected ? (
        <div className="space-y-3 text-sm">
          <p>Connect your YouTube channel once, then publishing is one click.</p>
          <Link href="/youtube" className="inline-flex h-9 items-center rounded-lg bg-primary px-3 font-medium text-primary-foreground hover:opacity-90">Connect YouTube</Link>
        </div>
      ) : phase === "review" ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
            <div className="space-y-2">
              {thumbPreview && includeThumb ? (
                // eslint-disable-next-line @next/next/no-img-element -- local data URL preview.
                <img src={thumbPreview} alt="Thumbnail" className="aspect-video w-full rounded-lg border border-border object-cover" />
              ) : (
                <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-border text-center text-xs text-muted-text">
                  {variant ? "Thumbnail off" : "No thumbnail yet — add one in Thumbnail Studio"}
                </div>
              )}
              {variant && (
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={includeThumb} onChange={(e) => setIncludeThumb(e.target.checked)} /> Use “{variant.name}”</label>
              )}
            </div>
            <div className="space-y-3">
              <Input label="Title" value={title} maxLength={YT_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} hint={`${title.length}/${YT_TITLE_MAX}`} />
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 text-sm" role="radiogroup" aria-label="Visibility">
                {(["public", "unlisted", "private"] as const).map((v) => (
                  <button key={v} type="button" role="radio" aria-checked={privacy === v} onClick={() => setPrivacy(v)} className={cx("rounded-md py-1.5 font-medium capitalize transition-colors", privacy === v ? "bg-surface shadow-sm" : "text-muted-text hover:text-foreground")}>
                    {v}
                  </button>
                ))}
              </div>
              <Input
                label="Schedule (optional)"
                type="datetime-local"
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                hint={schedule ? `Uploads now as private and goes public automatically at this time (${Intl.DateTimeFormat().resolvedOptions().timeZone}).` : "Leave empty to publish as soon as YouTube finishes processing."}
                error={schedule ? scheduleProblem ?? undefined : undefined}
              />
            </div>
          </div>

          <Textarea label="Description" rows={6} value={description} onChange={(e) => setDescription(e.target.value)} hint={`${description.length}/${YT_DESCRIPTION_MAX} · chapters and hashtags from Packaging are included`} />
          <Input label="Tags" value={tags} onChange={(e) => setTags(e.target.value)} hint={`${normalizeTags(tags.split(",")).length} tags · trimmed to YouTube's 500-character limit`} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {YT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
            <Select label="Language" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {[["en", "English"], ["es", "Spanish"], ["fr", "French"], ["de", "German"], ["pt", "Portuguese"], ["hi", "Hindi"], ["ar", "Arabic"], ["yo", "Yoruba"], ["ha", "Hausa"], ["ig", "Igbo"]].map(([id, l]) => <option key={id} value={id}>{l}</option>)}
            </Select>
            <Select label="Playlist" value={playlistId} onChange={(e) => setPlaylistId(e.target.value)} disabled={!conn.canManage} hint={conn.canManage ? undefined : "Needs one extra permission (below)"}>
              <option value="">None</option>
              {playlists.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </Select>
          </div>

          <div className="grid gap-2 rounded-lg border border-border p-3 text-sm sm:grid-cols-2">
            <label className="flex items-center gap-2"><input type="checkbox" checked={includeCaptions} disabled={!vtt || !conn.canManage} onChange={(e) => setIncludeCaptions(e.target.checked)} /> Upload captions {vtt ? `(${cueCount} lines)` : "(none on timeline)"}</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Notify subscribers</label>
            <label className="flex items-center gap-2" title="YouTube requires disclosure of realistic AI-generated or altered content."><input type="checkbox" checked={synthetic} onChange={(e) => setSynthetic(e.target.checked)} /> Contains AI-generated or altered content</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={madeForKids} onChange={(e) => setMadeForKids(e.target.checked)} /> Made for kids (COPPA)</label>
          </div>

          {!conn.canManage && (
            <p className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-text">
              <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
              Playlists and captions need one extra YouTube permission. Everything else publishes without it.
              <a href="/api/v1/youtube/oauth/start" className="font-medium text-primary hover:underline">Allow playlists &amp; captions</a>
            </p>
          )}

          <div className="rounded-lg border border-border p-3 text-sm">
            <p className="flex items-center gap-2 font-medium"><Film className="size-4" aria-hidden="true" /> Video</p>
            {prerendered && !file ? (
              <p className="mt-1 text-muted-text">Your finished export ({fmtMb(prerendered.blob.size)}) is uploaded directly — no download needed.</p>
            ) : file ? (
              <p className="mt-1 text-muted-text">{file.name} · {fmtMb(file.size)} <button type="button" className="ml-2 text-primary hover:underline" onClick={() => setFile(null)}>Render from timeline instead</button></p>
            ) : (
              <p className="mt-1 text-muted-text">
                Rendered from your timeline: {source.comp.canvas.width}×{source.comp.canvas.height}, {source.fps} fps, {Math.floor(source.duration / 60)}:{String(Math.round(source.duration % 60)).padStart(2, "0")}. Rendering takes about as long as the video — keep this tab open.
                <label className="ml-2 cursor-pointer text-primary hover:underline">
                  Use a finished file instead
                  <input type="file" accept="video/*" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </label>
              </p>
            )}
            {renderBlocked && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> Blocking issues: {source.blockingIssues.slice(0, 3).join(" · ")}</p>
            )}
          </div>

          {formError && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{formError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => void start()} disabled={Boolean(scheduleProblem) || renderBlocked}>
              <MonitorPlay className="size-4" aria-hidden="true" /> {schedule ? "Schedule on YouTube" : "Publish to YouTube"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <ol className="space-y-2">
            {steps.map((s) => {
              const Icon = STEP_META[s.id].icon;
              return (
                <li key={s.id} className={cx("rounded-lg border p-3 transition-colors", s.state === "active" ? "border-primary bg-primary/5" : s.state === "failed" ? "border-destructive/50 bg-destructive/5" : "border-border")}>
                  <div className="flex items-center gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center">
                      {s.state === "done" ? <Check className="size-4 text-success" aria-hidden="true" /> : s.state === "active" ? <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" /> : s.state === "failed" ? <X className="size-4 text-destructive" aria-hidden="true" /> : s.state === "skipped" ? <MinusCircle className="size-4 text-muted-text" aria-hidden="true" /> : <Circle className="size-4 text-muted-text" aria-hidden="true" />}
                    </span>
                    <Icon className="size-4 text-muted-text" aria-hidden="true" />
                    <span className={cx("text-sm font-medium", s.state === "skipped" && "text-muted-text")}>{s.label}</span>
                    {s.progress !== null && s.state === "active" && <span className="ml-auto text-xs tabular-nums text-muted-text">{s.progress}%</span>}
                  </div>
                  {s.detail && <p className={cx("mt-1 pl-9 text-xs", s.state === "failed" ? "text-destructive" : "text-muted-text")}>{s.detail}</p>}
                  {s.progress !== null && s.state === "active" && (
                    <div className="ml-9 mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={s.progress} aria-valuemin={0} aria-valuemax={100} aria-label={s.label}>
                      <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${s.progress}%` }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          {warnings.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-warning/10 p-3 text-xs text-warning">
              {warnings.map((w) => <li key={w} className="flex gap-1.5"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> {w}</li>)}
            </ul>
          )}

          {phase === "running" && <p className="text-xs text-muted-text">Keep this tab open until the upload finishes. You can switch tabs, but closing it stops the upload.</p>}

          {phase === "failed" && failedStep && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-destructive/10 p-3">
              <p className="min-w-0 flex-1 text-sm text-destructive">{failedStep.label} failed. {failedStep.id === "upload" ? "Retry resumes from where the upload stopped." : "Everything that already finished is kept."}</p>
              <Button size="sm" onClick={() => { setPhase("running"); void execute(); }}><RotateCcw className="size-3.5" aria-hidden="true" /> Retry</Button>
              {failedStep.id !== "render" && failedStep.id !== "upload" && <Button size="sm" variant="outline" onClick={skipFailed}>Skip this step</Button>}
              {run.current.blob && <Button size="sm" variant="outline" onClick={() => downloadBlob(run.current.blob!, `${source.projectName.replace(/[^\w-]+/g, "-")}.${run.current.mime.includes("mp4") ? "mp4" : "webm"}`)}>Download video</Button>}
            </div>
          )}

          {phase === "done" && result && (
            <div className="space-y-3 rounded-xl border border-success/40 bg-success/5 p-4">
              <p className="flex items-center gap-2 font-semibold text-success"><Check className="size-5" aria-hidden="true" /> {result.scheduled ? `Scheduled for ${new Date(result.scheduled).toLocaleString()}` : privacy === "public" ? "Your video is live on YouTube" : `Uploaded as ${privacy}`}</p>
              {result.stillProcessing && <p className="text-xs text-muted-text">YouTube is still processing higher resolutions. The video is already on your channel and will finish on its own.</p>}
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-muted px-2 py-1 text-sm">{url}</code>
                <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                  {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />} {copied ? "Copied" : "Copy link"}
                </Button>
              </div>
              <div className="aspect-video overflow-hidden rounded-lg bg-black">
                <iframe className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${result.videoId}?rel=0`} title="Published video" allow="encrypted-media; picture-in-picture" allowFullScreen />
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90">Watch on YouTube <ExternalLink className="size-3.5" aria-hidden="true" /></a>
                <a href={`https://studio.youtube.com/video/${result.videoId}/edit`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted">Open in YouTube Studio <ExternalLink className="size-3.5" aria-hidden="true" /></a>
                <Badge tone="neutral" className="self-center">{steps.filter((s) => s.state === "done").length} steps done</Badge>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
