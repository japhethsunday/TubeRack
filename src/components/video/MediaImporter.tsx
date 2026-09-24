"use client";

import { useRef, useState } from "react";
import { UploadCloud, X, RotateCcw, Check, HardDrive, Cloud, Film, Music2, ImageIcon, Plus } from "lucide-react";
import { validateUpload, readHeader, type UploadKind } from "@/src/lib/media/validation";
import { useMedia } from "@/src/components/media/MediaProvider";
import { useSession } from "@/src/components/auth/useSession";
import { uploadToCloud } from "@/src/lib/media/cloud-upload";
import type { MediaAsset } from "@/src/lib/media/types";
import { Button } from "@/src/components/ui/Button";
import { cx } from "@/src/components/ui/cx";
import { MAX_PARTS, PART_BYTES } from "@/src/lib/media/chunked";

/** Cloud storage takes files up to this size (large files upload in parts). */
export const CLOUD_MAX_BYTES = PART_BYTES * MAX_PARTS;

type JobState = "reading" | "importing" | "done" | "failed" | "cancelled" | "duplicate";

interface Job {
  id: string;
  file: File;
  kind: UploadKind | null;
  state: JobState;
  progress: number;
  where: "cloud" | "device" | null;
  error: string;
  /** Why a signed-in import stayed on this device (cloud unavailable). */
  note: string;
  asset: MediaAsset | null;
}

const fmt = (n: number) => (n > 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : `${(n / 1024 ** 2).toFixed(1)} MB`);
const KIND_ICON: Record<UploadKind, typeof Film> = { video: Film, audio: Music2, image: ImageIcon };

function probe(kind: UploadKind, url: string): Promise<{ durationSec?: number; width?: number; height?: number }> {
  if (kind === "image") {
    const img = new Image();
    img.src = url;
    return img.decode().then(() => ({ width: img.naturalWidth, height: img.naturalHeight }));
  }
  return new Promise((resolve, reject) => {
    const el = document.createElement(kind);
    el.preload = "metadata";
    el.muted = true;
    const finish = () =>
      resolve({
        durationSec: Number.isFinite(el.duration) && el.duration > 0 ? el.duration : undefined,
        ...(kind === "video" ? { width: (el as HTMLVideoElement).videoWidth, height: (el as HTMLVideoElement).videoHeight } : {}),
      });
    el.onloadedmetadata = () => {
      if (Number.isFinite(el.duration)) return finish();
      // Recorded WebM often omits its duration: seek far past the end so the
      // browser scans the file and reports the real length.
      el.ontimeupdate = () => {
        el.ontimeupdate = null;
        finish();
      };
      el.currentTime = 1e9;
      setTimeout(finish, 8000);
    };
    el.onerror = () => reject(new Error(kind === "video" ? "This browser can't play that video's format. Convert it to MP4 (H.264) or WebM." : "This browser can't play that audio file."));
    el.src = url;
  });
}

/**
 * Import media into a project: validates by content, detects duplicates,
 * stores in the cloud (≤ 50 MB, signed in) or on this device (any size,
 * survives reloads), and hands the asset to the editor.
 */
export function MediaImporter({
  projectId,
  onImported,
  compact,
}: {
  projectId: string;
  onImported?: (asset: MediaAsset) => void;
  compact?: boolean;
}) {
  const { addAsset, updateAsset, removeAsset, persistBlob, assetsFor } = useMedia();
  const session = useSession();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [dragging, setDragging] = useState(false);
  const aborts = useRef(new Map<string, AbortController>());
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const patch = (id: string, p: Partial<Job>) => setJobs((all) => all.map((j) => (j.id === id ? { ...j, ...p } : j)));

  async function run(job: Job) {
    const ac = new AbortController();
    aborts.current.set(job.id, ac);
    let created: MediaAsset | null = null;
    try {
      patch(job.id, { state: "reading", progress: 2, error: "" });
      const found = validateUpload(await readHeader(job.file), job.file.size);
      const kind = found.kind;
      const fingerprint = `fp:${job.file.name}|${job.file.size}|${job.file.lastModified}`;
      const existing = assetsFor(projectId).find((a) => a.tags.includes(fingerprint) && a.status === "ready");
      if (existing) {
        patch(job.id, { state: "duplicate", kind, progress: 100, asset: existing });
        return;
      }
      const tmpUrl = URL.createObjectURL(job.file);
      const meta = await probe(kind, tmpUrl).finally(() => URL.revokeObjectURL(tmpUrl));
      const toCloud = session.status === "signed-in" && job.file.size <= CLOUD_MAX_BYTES;
      patch(job.id, { state: "importing", kind, progress: 5, where: toCloud ? "cloud" : "device", note: "" });
      created = addAsset({
        projectId,
        sceneIds: [],
        kind: kind === "audio" ? "music" : kind,
        source: "upload-session",
        status: "processing",
        title: job.file.name,
        payload: "",
        mime: found.mime,
        durationSec: meta.durationSec,
        width: meta.width,
        height: meta.height,
        fileSize: job.file.size,
        tags: ["import", kind, fingerprint],
        approval: "draft",
      });
      let stored = false;
      if (toCloud) {
        try {
          const up = await uploadToCloud(job.file, found.mime, (r) => patch(job.id, { progress: 5 + Math.round(r * 93) }), ac.signal);
          // Keep a device copy: editing plays from local bytes (phones often
          // won't buffer a remote video in a background element).
          await persistBlob(created.id, job.file, undefined, ac.signal).catch(() => undefined);
          updateAsset(created.id, { source: "provider-output", payload: up.fileUrl, status: "ready" });
          stored = true;
        } catch (cloudError) {
          if (ac.signal.aborted) throw cloudError;
          // Cloud refused (format, quota, network): keep it usable on this device.
          const reason = cloudError instanceof Error ? cloudError.message : "Cloud upload failed.";
          patch(job.id, { where: "device", progress: 5, note: `Saved on this device only — ${reason} It won't appear on your other devices.` });
        }
      }
      if (!stored) {
        await persistBlob(created.id, job.file, (r) => patch(job.id, { progress: 5 + Math.round(r * 93) }), ac.signal);
        updateAsset(created.id, { status: "ready" });
      }
      const asset = { ...created, status: "ready" as const };
      patch(job.id, { state: "done", progress: 100, asset });
      onImported?.(asset);
    } catch (error) {
      if (created) removeAsset(created.id);
      const cancelled = ac.signal.aborted;
      patch(job.id, { state: cancelled ? "cancelled" : "failed", error: cancelled ? "Cancelled." : error instanceof Error ? error.message : "Import failed." });
    } finally {
      aborts.current.delete(job.id);
    }
  }

  function add(files: FileList | File[]) {
    const next: Job[] = Array.from(files).map((file) => ({
      id: `imp_${Date.now().toString(36)}_${++seq.current}`,
      file,
      kind: null,
      state: "reading",
      progress: 0,
      where: null,
      error: "",
      note: "",
      asset: null,
    }));
    setJobs((all) => [...next, ...all].slice(0, 12));
    // Sequential imports keep memory and bandwidth predictable.
    void next.reduce((p, j) => p.then(() => run(j)), Promise.resolve());
  }

  // Compact (studio bin): finished imports are already tiles in the bin, so
  // only in-flight, failed, duplicate, or device-only results are listed.
  const shownJobs = compact ? jobs.filter((j) => j.state !== "done" || j.note) : jobs;
  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
        className={cx(
          "flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-center transition-colors",
          compact ? "p-3" : "p-6",
          dragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 hover:bg-muted/40",
        )}
      >
        <UploadCloud className={cx("text-primary", compact ? "size-5" : "size-8")} aria-hidden="true" />
        <p className="text-sm font-medium">{compact ? "Drop media to import" : "Drop videos, audio, or images here"}</p>
        {!compact && <p className="text-xs text-muted-text">MP4, MOV, WebM, MP3, M4A, WAV, PNG, JPEG. Saved to your account so every device sees it (up to 2.8 GB). Originals are never modified.</p>}
        <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
          <Plus className="size-3.5" aria-hidden="true" /> Choose files
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="video/*,audio/*,image/*,.mkv,.mov"
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {shownJobs.length > 0 && (
        <ul className="space-y-1.5" aria-label="Imports">
          {shownJobs.map((j) => {
            const Icon = j.kind ? KIND_ICON[j.kind] : Film;
            return (
              <li key={j.id} className="ui-panel rounded-lg border border-border bg-surface p-2">
                <div className="flex items-center gap-2 text-xs">
                  <Icon className="size-3.5 shrink-0 text-muted-text" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-medium" title={j.file.name}>{j.file.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-text">{fmt(j.file.size)}</span>
                  {j.where && (
                    <span className="shrink-0 text-muted-text" title={j.where === "cloud" ? "Stored in your account" : "Stored on this device"}>
                      {j.where === "cloud" ? <Cloud className="size-3.5" aria-label="Cloud" /> : <HardDrive className="size-3.5" aria-label="This device" />}
                    </span>
                  )}
                  {(j.state === "reading" || j.state === "importing") && (
                    <button type="button" aria-label={`Cancel ${j.file.name}`} onClick={() => aborts.current.get(j.id)?.abort()} className="rounded p-0.5 text-muted-text hover:bg-muted hover:text-foreground">
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  )}
                  {(j.state === "failed" || j.state === "cancelled") && (
                    <button type="button" aria-label={`Retry ${j.file.name}`} onClick={() => void run(j)} className="rounded p-0.5 text-muted-text hover:bg-muted hover:text-foreground">
                      <RotateCcw className="size-3.5" aria-hidden="true" />
                    </button>
                  )}
                  {j.state === "done" && <Check className="size-3.5 shrink-0 text-success" aria-label="Imported" />}
                </div>
                {(j.state === "reading" || j.state === "importing") && (
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={j.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Importing ${j.file.name}`}>
                    <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${j.progress}%` }} />
                  </div>
                )}
                {j.state === "failed" && <p className="mt-1 text-xs text-destructive">{j.error}</p>}
                {j.note && j.state === "done" && <p className="mt-1 text-xs text-warning">{j.note}</p>}
                {j.state === "duplicate" && j.asset && (
                  <p className="mt-1 flex items-center gap-2 text-xs text-muted-text">
                    Already in this project.
                    {onImported && (
                      <button type="button" className="font-medium text-primary hover:underline" onClick={() => onImported(j.asset!)}>
                        Add to timeline
                      </button>
                    )}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
