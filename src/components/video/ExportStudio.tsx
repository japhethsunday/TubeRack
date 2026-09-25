"use client";

import { fastExportSupported } from "@/src/lib/video/render-fast";
import { useEffect, useRef, useState } from "react";
import { Download, Film, X, RotateCcw, Check, AlertTriangle, MonitorPlay, Loader2 } from "lucide-react";
import type { Composition, HealthState, ValidationIssue } from "@/src/lib/video/types";
import { estimateBitrate, renderComposition, renderSupport, RenderError, type ExportQuality, type RenderAsset } from "@/src/lib/video/render";
import { downloadBlob, safeFileName } from "@/src/lib/download";
import { Button } from "@/src/components/ui/Button";
import { cx } from "@/src/components/ui/cx";

export interface ExportSettings {
  height: number;
  fps: number;
  quality: ExportQuality;
  audioKbps: number;
  range: "all" | "inout";
}

export interface FinishedExport {
  blob: Blob;
  mime: string;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  createdAt: number;
}

const HEIGHTS = [2160, 1440, 1080, 720, 480] as const;
const HEIGHT_LABEL: Record<number, string> = { 2160: "4K", 1440: "1440p", 1080: "1080p", 720: "720p", 480: "480p" };

export function sizeFor(comp: Composition, height: number): { width: number; height: number } {
  const w = comp.canvas.width || 1920;
  const h = comp.canvas.height || 1080;
  // "Height" means the short side, so vertical videos export at e.g. 1080×1920.
  const short = Math.min(w, h);
  const k = height / short;
  const even = (n: number) => Math.round(n / 2) * 2;
  return { width: even(w * k), height: even(h * k) };
}

const fmtMb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const fmtTime = (s: number) => (s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`);

/** Export panel: settings, validation, progress, cancel, download, and hand-off to publishing. */
export function ExportStudio({
  comp,
  duration,
  projectName,
  issues,
  health,
  assetFor,
  inOut,
  onPublish,
}: {
  comp: Composition;
  duration: number;
  projectName: string;
  issues: ValidationIssue[];
  health: HealthState;
  assetFor: (id: string | undefined) => RenderAsset | null;
  inOut: { in: number; out: number } | null;
  onPublish: (exp: FinishedExport) => void;
}) {
  const [settings, setSettings] = useState<ExportSettings>({ height: 1080, fps: 30, quality: "high", audioKbps: 192, range: "all" });
  const [state, setState] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [progress, setProgress] = useState({ ratio: 0, message: "", eta: undefined as number | undefined });
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [result, setResult] = useState<FinishedExport | null>(null);
  const abort = useRef<AbortController | null>(null);
  const [fastExport, setFastExport] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- browser capability, known only after mount.
  useEffect(() => setFastExport(fastExportSupported()), []);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);
  const support = typeof window !== "undefined" ? renderSupport() : { ok: true };
  const { width, height } = sizeFor(comp, settings.height);
  const range = settings.range === "inout" && inOut ? { from: inOut.in, to: inOut.out } : { from: 0, to: duration };
  const span = Math.max(0, range.to - range.from);
  const estBytes = ((estimateBitrate(width, height, settings.fps, settings.quality) + settings.audioKbps * 1000) * span) / 8;
  const blocking = issues.filter((i) => i.severity === "block");
  // What sets the length: the clip that ends last (background music never does).
  const longest = comp.clips
    .filter((c) => c.kind !== "music")
    .reduce<(typeof comp.clips)[number] | null>((m, c) => (!m || c.startSec + c.durationSec > m.startSec + m.durationSec ? c : m), null);
  const visualEnd = comp.clips.filter((c) => c.kind === "image" || c.kind === "video").reduce((n, c) => Math.max(n, c.startSec + c.durationSec), 0);
  const set = (p: Partial<ExportSettings>) => setSettings((s) => ({ ...s, ...p }));

  async function start() {
    const ac = new AbortController();
    abort.current = ac;
    setState("running");
    setError("");
    setWarnings([]);
    setProgress({ ratio: 0, message: "Preparing…", eta: undefined });
    try {
      const out = await renderComposition({
        comp,
        duration,
        width,
        height,
        fps: settings.fps,
        quality: settings.quality,
        audioKbps: settings.audioKbps,
        range,
        assetFor,
        signal: ac.signal,
        onProgress: (p) => setProgress({ ratio: p.phase === "preparing" ? p.ratio * 0.05 : p.phase === "rendering" ? 0.05 + p.ratio * 0.93 : 0.99, message: p.message, eta: p.etaSec }),
      });
      setWarnings(out.warnings);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(out.blob);
      setPreviewUrl(urlRef.current);
      setResult({ blob: out.blob, mime: out.mime, width: out.width, height: out.height, fps: out.fps, durationSec: out.durationSec, createdAt: Date.now() });
      setState("done");
    } catch (e) {
      setError(e instanceof RenderError || e instanceof Error ? e.message : "Export failed.");
      setState(ac.signal.aborted ? "idle" : "failed");
    } finally {
      abort.current = null;
    }
  }

  const ext = result?.mime.includes("mp4") ? "mp4" : "webm";

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <p className="flex items-center gap-2 text-sm font-semibold"><Film className="size-4 text-primary" aria-hidden="true" /> Export</p>

      <div>
        <p className="text-xs font-medium">Resolution</p>
        <div className="mt-1 grid grid-cols-5 gap-1">
          {HEIGHTS.map((h) => (
            <button key={h} type="button" onClick={() => set({ height: h })} aria-pressed={settings.height === h} disabled={state === "running"} className={cx("rounded-md border py-1.5 text-xs font-medium transition-colors", settings.height === h ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>
              {HEIGHT_LABEL[h]}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs">Frame rate
          <select value={settings.fps} disabled={state === "running"} onChange={(e) => set({ fps: Number(e.target.value) })} className="mt-0.5 h-8 w-full rounded-lg border border-border bg-surface px-2 text-sm">
            {[24, 25, 30, 50, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}
          </select>
        </label>
        <label className="text-xs">Quality
          <select value={settings.quality} disabled={state === "running"} onChange={(e) => set({ quality: e.target.value as ExportQuality })} className="mt-0.5 h-8 w-full rounded-lg border border-border bg-surface px-2 text-sm">
            <option value="draft">Draft (small file)</option>
            <option value="standard">Standard</option>
            <option value="high">High (YouTube)</option>
            <option value="max">Maximum</option>
          </select>
        </label>
        <label className="text-xs">Audio
          <select value={settings.audioKbps} disabled={state === "running"} onChange={(e) => set({ audioKbps: Number(e.target.value) })} className="mt-0.5 h-8 w-full rounded-lg border border-border bg-surface px-2 text-sm">
            {[128, 192, 256, 320].map((k) => <option key={k} value={k}>{k} kbps</option>)}
          </select>
        </label>
        <label className="text-xs">Range
          <select value={settings.range} disabled={state === "running"} onChange={(e) => set({ range: e.target.value as "all" | "inout" })} className="mt-0.5 h-8 w-full rounded-lg border border-border bg-surface px-2 text-sm">
            <option value="all">Whole timeline</option>
            <option value="inout" disabled={!inOut}>In → out marks{inOut ? "" : " (set with I / O)"}</option>
          </select>
        </label>
      </div>
      <p className="text-[11px] text-muted-text">
        {width}×{height} · {settings.fps} fps · {fmtTime(span)} · ≈{fmtMb(estBytes)}. {fastExport ? "Fast export: usually quicker than the video’s length. Keep this tab open." : "Export runs in real time in this tab."}
      {longest && settings.range === "all" && (
          <span className="mt-1 block">
            Length set by “{longest.name}” (ends at {fmtTime(longest.startSec + longest.durationSec)}).
            {visualEnd > 0 && longest.startSec + longest.durationSec - visualEnd > 2 && (
              <span className="text-warning"> Pictures end at {fmtTime(visualEnd)} — the rest would show a blank screen. Trim that clip or add visuals.</span>
            )}
          </span>
        )}</p>

      {blocking.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
          {blocking.slice(0, 4).map((i, n) => <li key={n} className="flex gap-1.5"><AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" /> {i.message} {i.fix}</li>)}
        </ul>
      )}
      {!support.ok && <p className="rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">{support.reason}</p>}

      {state === "running" ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5"><Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> {progress.message}</span>
            <span className="tabular-nums text-muted-text">{Math.round(progress.ratio * 100)}%{progress.eta !== undefined && ` · ${fmtTime(progress.eta)} left`}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(progress.ratio * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Export progress">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-500 transition-[width] duration-300" style={{ width: `${progress.ratio * 100}%` }} />
          </div>
          <Button size="sm" variant="outline" className="w-full" onClick={() => abort.current?.abort()}><X className="size-3.5" aria-hidden="true" /> Cancel export</Button>
          <p className="text-[11px] text-muted-text">Keep this tab open. You can keep working in other tabs.</p>
        </div>
      ) : (
        <Button className="w-full" disabled={health === "blocked" || !support.ok || span <= 0} onClick={() => void start()}>
          {state === "failed" ? <RotateCcw className="size-4" aria-hidden="true" /> : <Film className="size-4" aria-hidden="true" />} {state === "failed" ? "Retry export" : state === "done" ? "Export again" : "Export video"}
        </Button>
      )}

      {error && <p role="alert" className="rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">{error}</p>}
      {warnings.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-warning/10 p-2.5 text-xs text-warning">
          {warnings.map((w) => <li key={w} className="flex gap-1.5"><AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" /> {w}</li>)}
        </ul>
      )}

      {result && state === "done" && (
        <div className="ui-panel space-y-2 rounded-lg border border-success/40 bg-success/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-success"><Check className="size-4" aria-hidden="true" /> Export ready</p>
          <p className="text-xs text-muted-text">{result.width}×{result.height} · {result.fps} fps · {ext.toUpperCase()} · {fmtMb(result.blob.size)}</p>
          {previewUrl && <video src={previewUrl} controls className="aspect-video w-full rounded-md bg-black" />}
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={() => onPublish(result)}><MonitorPlay className="size-3.5" aria-hidden="true" /> Publish to YouTube</Button>
            <Button size="sm" variant="outline" onClick={() => downloadBlob(result.blob, safeFileName(projectName, ext))}><Download className="size-3.5" aria-hidden="true" /> Download</Button>
          </div>
        </div>
      )}
    </div>
  );
}
