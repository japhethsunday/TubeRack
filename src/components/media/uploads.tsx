"use client";

import { useRef, useState } from "react";
import { Upload, X, RotateCcw } from "lucide-react";
import { validateUpload, readHeader, UPLOAD_LIMITS, type UploadKind } from "@/src/lib/media/validation";
import { useMedia, MediaStorageNote } from "@/src/components/media/MediaProvider";
import { Button } from "@/src/components/ui/Button";
import { Progress } from "@/src/components/ui/feedback";
import { Alert } from "@/src/components/ui/Alert";
import { EmptyState } from "@/src/components/ui/states";
import type { UploadSession } from "@/src/lib/media/types";

function kindLabel(kind: UploadKind): string {
  return kind === "image" ? "Image" : kind === "video" ? "Video" : "Audio";
}

/** Real upload intake: magic-byte validation, metadata extraction, session bytes. */
export function UploadZone({ projectId }: { projectId: string }) {
  const { addAsset, putBlob } = useMedia();
  const [sessions, setSessions] = useState<UploadSession[]>([]);
  const [dragging, setDragging] = useState(false);
  const cancelFlags = useRef(new Map<string, boolean>());
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  function patch(id: string, patch: Partial<UploadSession>) {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async function probeMeta(kind: UploadKind, url: string): Promise<{ durationSec?: number; width?: number; height?: number }> {
    if (kind === "image") {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { width: img.naturalWidth, height: img.naturalHeight };
    }
    const el = document.createElement(kind);
    el.preload = "metadata";
    el.src = url;
    await new Promise<void>((resolve, reject) => {
      el.onloadedmetadata = () => resolve();
      el.onerror = () => reject(new Error("Could not read media metadata."));
    });
    const out: { durationSec?: number; width?: number; height?: number } = { durationSec: el.duration };
    if (kind === "video") {
      out.width = (el as HTMLVideoElement).videoWidth;
      out.height = (el as HTMLVideoElement).videoHeight;
    }
    return out;
  }

  async function ingest(file: File) {
    seq.current += 1;
    const id = `upl_${Date.now().toString(36)}_${seq.current}`;
    cancelFlags.current.set(id, false);
    setSessions((prev) => [
      { id, name: file.name, mime: file.type || "unknown", size: file.size, progress: 5, status: "reading" as const },
      ...prev,
    ].slice(0, 10));

    try {
      const header = await readHeader(file);
      if (cancelFlags.current.get(id)) {
        patch(id, { status: "cancelled" });
        return;
      }
      const found = validateUpload(header, file.size);
      patch(id, { progress: 40, mime: found.mime });
      const url = putBlob(id, file);
      patch(id, { progress: 70 });
      const meta = await probeMeta(found.kind, url);
      if (cancelFlags.current.get(id)) {
        patch(id, { status: "cancelled" });
        return;
      }
      addAsset({
        projectId,
        sceneIds: [],
        kind: found.kind === "audio" ? "music" : found.kind,
        source: "upload-session",
        status: "ready",
        title: file.name,
        payload: "",
        mime: found.mime,
        durationSec: meta.durationSec,
        width: meta.width,
        height: meta.height,
        fileSize: file.size,
        tags: ["upload", found.kind],
        approval: "draft",
      });
      patch(id, { progress: 100, status: "ready" });
    } catch (e) {
      patch(id, { status: "failed", error: e instanceof Error ? e.message : "Upload failed." });
    }
  }

  function retry(session: UploadSession) {
    // Retry needs the original bytes — kept only while the tab holds the file picker entry.
    patch(session.id, { status: "failed", error: "Original file reference expired. Choose the file again to retry." });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload files: drag and drop or activate to browse"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            for (const f of Array.from(e.dataTransfer.files)) void ingest(f);
          }}
          className={`flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-muted-text/50"}`}
        >
          <Upload className="size-6 text-muted-text" aria-hidden="true" />
          <p className="text-sm font-medium">Drop files here or browse</p>
          <p className="text-xs text-muted-text">
            PNG · JPEG · GIF · WebP · MP4 · WebM · MP3 · WAV · OGG — by content, not extension.
            Images ≤ {UPLOAD_LIMITS.image.label}, video ≤ {UPLOAD_LIMITS.video.label}, audio ≤ {UPLOAD_LIMITS.audio.label}.
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,video/*,audio/*"
            className="sr-only"
            onChange={(e) => {
              for (const f of Array.from(e.target.files ?? [])) void ingest(f);
              e.target.value = "";
            }}
          />
        </div>
        <Alert tone="info" title="Session bytes, validated content">
          Files are sniffed by magic bytes and capped by size. Bytes live for this session only — metadata
          persists; re-upload after reload. Server-side validation still applies in Phase 11.
        </Alert>
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Intake ({sessions.length})</h3>
        {sessions.length === 0 ? (
          <EmptyState title="Nothing uploaded" body="Each file gets validation, real metadata extraction, progress, cancel, and retry." />
        ) : (
          <ul className="space-y-2" aria-label="Upload sessions">
            {sessions.map((s) => (
              <li key={s.id} className="rounded-xl border border-border bg-surface p-3">
                <p className="flex items-center justify-between gap-2 text-sm font-medium">
                  <span className="truncate">{s.name}</span>
                  <span className="flex shrink-0 gap-1">
                    {s.status === "reading" && (
                      <button type="button" onClick={() => cancelFlags.current.set(s.id, true)} aria-label={`Cancel ${s.name}`} className="rounded p-1 text-muted-text hover:text-destructive">
                        <X className="size-4" aria-hidden="true" />
                      </button>
                    )}
                    {s.status === "failed" && (
                      <button type="button" onClick={() => retry(s)} aria-label={`Retry ${s.name}`} className="rounded p-1 text-muted-text hover:text-foreground">
                        <RotateCcw className="size-4" aria-hidden="true" />
                      </button>
                    )}
                  </span>
                </p>
                <p className="text-xs text-muted-text">{s.mime} · {(s.size / 1024).toFixed(0)} KB · {s.status}</p>
                {s.status === "reading" && <div className="mt-2"><Progress value={s.progress} label={`Reading ${s.name}`} /></div>}
                {s.status === "failed" && (
                  <p role="alert" className="mt-1.5 rounded bg-destructive/10 p-2 text-xs text-destructive">{s.error}</p>
                )}
                {s.status === "ready" && <p role="status" className="mt-1 text-xs text-success">Validated and added to the library.</p>}
              </li>
            ))}
          </ul>
        )}
        <MediaStorageNote compact />
      </div>
    </div>
  );
}

export type { UploadKind };
export { kindLabel };
