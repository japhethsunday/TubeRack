"use client";

import { useState } from "react";
import { Check, X, Trash2, Columns2, RotateCcw } from "lucide-react";
import type { ApprovalState, MediaAsset, MediaKind, MediaStatus } from "@/src/lib/media/types";
import { useMedia } from "@/src/components/media/MediaProvider";
import { DraftImage, FilePreview, SpeechPreview } from "@/src/components/media/players";
import { Badge } from "@/src/components/ui/Badge";
import { EmptyState } from "@/src/components/ui/states";
import { Dropdown } from "@/src/components/ui/Dropdown";
import { Search } from "@/src/components/ui/search";
import { cx } from "@/src/components/ui/cx";

const STATUS_META: Record<MediaStatus, { label: string; tone: "neutral" | "ok" | "warn" | "bad" | "info" }> = {
  pending: { label: "Pending", tone: "neutral" },
  preparing: { label: "Preparing", tone: "info" },
  generating: { label: "Generating", tone: "info" },
  processing: { label: "Processing", tone: "info" },
  ready: { label: "Ready", tone: "ok" },
  failed: { label: "Failed", tone: "bad" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

const APPROVAL_META: Record<ApprovalState, { label: string; tone: "neutral" | "ok" | "warn" | "bad" | "info" }> = {
  draft: { label: "Draft", tone: "neutral" },
  reviewed: { label: "Reviewed", tone: "info" },
  approved: { label: "Approved", tone: "ok" },
  used: { label: "In scenes", tone: "ok" },
  rejected: { label: "Rejected", tone: "bad" },
};

export function StatusBadge({ status }: { status: MediaStatus }) {
  const meta = STATUS_META[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

function ApprovalBadge({ approval }: { approval: ApprovalState }) {
  const meta = APPROVAL_META[approval];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

/** Preview dispatched by kind + source. Uploads without session bytes disclose it. */
export function AssetPreview({ asset, blobUrl }: { asset: MediaAsset; blobUrl: string | null }) {
  if (asset.kind === "image" && asset.source === "local-draft") {
    return <DraftImage svg={asset.payload} title={asset.title} />;
  }
  if ((asset.kind === "voice" || asset.kind === "music" || asset.kind === "sfx") && asset.source === "local-draft") {
    return <AudioDraftPreview asset={asset} />;
  }
  if (asset.source === "upload-session") {
    if (!blobUrl) {
      return (
        <p role="status" className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-text">
          Source file left with the last session — re-upload to preview. Metadata below is intact.
        </p>
      );
    }
    if (asset.kind === "image") {
      // eslint-disable-next-line @next/next/no-img-element -- session blob URL; the optimizer cannot process object URLs.
      return <img src={blobUrl} alt={asset.title} className="aspect-video w-full rounded-lg border border-border object-contain bg-black" />;
    }
    return <FilePreview url={blobUrl} mime={asset.mime} label={asset.title} />;
  }
  if (asset.source === "provider-output") {
    if (asset.kind === "image") {
      // eslint-disable-next-line @next/next/no-img-element -- authenticated app URL; the optimizer cannot forward the session.
      return <img src={asset.payload} alt={asset.title} className="aspect-video w-full rounded-lg border border-border object-contain bg-black" />;
    }
    return <FilePreview url={asset.payload} mime={asset.mime} label={asset.title} />;
  }
  if (asset.source === "provider-request") {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-text" role="note" aria-label="Provider request, not media">
        <p className="font-medium text-foreground">Request draft — no media yet</p>
        <pre className="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap font-mono">{asset.payload.slice(0, 600)}</pre>
      </div>
    );
  }
  return null;
}

interface VoicePayload {
  text?: string;
  voiceName?: string;
  rate?: number;
  pitch?: number;
  lang?: string;
}

function AudioDraftPreview({ asset }: { asset: MediaAsset }) {
  let params: VoicePayload | null = null;
  try {
    const parsed: unknown = JSON.parse(asset.payload);
    if (parsed && typeof parsed === "object") params = parsed as VoicePayload;
  } catch {
    params = null;
  }
  if (asset.kind === "voice" && params?.text) {
    return (
      <SpeechPreview
        text={params.text}
        voiceName={params.voiceName}
        rate={params.rate ?? 1}
        pitch={params.pitch ?? 1}
        lang={params.lang ?? "en-US"}
        label={asset.title}
      />
    );
  }
  return (
    <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-text">
      Synthesized on demand in the Voice / Music studios — open the take there to play it.
    </p>
  );
}

/** Full asset card: preview, metadata, approval lifecycle, scene assignment. */
export function AssetCard({
  asset,
  sceneOptions,
  compareMode,
  compared,
  onToggleCompare,
}: {
  asset: MediaAsset;
  sceneOptions: { id: string; title: string }[];
  compareMode: boolean;
  compared: boolean;
  onToggleCompare: () => void;
}) {
  const { blobUrlFor, setApproval, assignScenes, removeAsset } = useMedia();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <article
      aria-label={asset.title}
      className={cx("overflow-hidden rounded-xl border bg-surface", compared ? "border-primary" : "border-border")}
    >
      <div className="p-3">
        <AssetPreview asset={asset} blobUrl={blobUrlFor(asset.id)} />
      </div>
      <div className="space-y-2 p-3 pt-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="truncate text-sm font-medium">{asset.title}</h4>
            <p className="mt-0.5 text-xs text-muted-text">
              {asset.kind} · {asset.source === "local-draft" ? "on-device draft" : asset.source === "upload-session" ? "upload (this session)" : asset.source === "provider-output" ? (asset.tags.includes("upload") ? "upload" : "Gemini") : "older request"}
              {asset.durationSec ? ` · ${asset.durationSec.toFixed(1)}s` : ""}
              {asset.width ? ` · ${asset.width}×${asset.height}` : ""}
              {typeof asset.fileSize === "number" ? ` · ${(asset.fileSize / 1024).toFixed(0)} KB` : ""}
            </p>
          </div>
          <span className="flex shrink-0 flex-col items-end gap-1">
            <StatusBadge status={asset.status} />
            <ApprovalBadge approval={asset.approval} />
          </span>
        </div>

        {asset.error && (
          <p role="alert" className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
            {asset.error}
          </p>
        )}

        {asset.sceneIds.length > 0 && (
          <p className="text-xs text-muted-text">
            Used in {asset.sceneIds.length} scene(s):{" "}
            {asset.sceneIds.map((id) => sceneOptions.find((s) => s.id === id)?.title ?? id).join(", ")}
          </p>
        )}

        {asset.status === "ready" && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Review ${asset.title}`}>
            {asset.approval === "draft" || asset.approval === "rejected" ? (
              <button type="button" onClick={() => setApproval(asset.id, "reviewed")} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-muted">
                Mark reviewed
              </button>
            ) : null}
            {asset.approval === "reviewed" || asset.approval === "rejected" ? (
              <button type="button" onClick={() => setApproval(asset.id, "approved")} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-muted">
                <Check className="size-3.5" aria-hidden="true" />
                Approve
              </button>
            ) : null}
            {(asset.approval === "reviewed" || asset.approval === "approved") && (
              <button type="button" onClick={() => setApproval(asset.id, "rejected")} className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-muted-text hover:bg-muted">
                <X className="size-3.5" aria-hidden="true" />
                Reject
              </button>
            )}
            {asset.approval === "rejected" && (
              <button type="button" onClick={() => setApproval(asset.id, "draft")} className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-muted-text hover:bg-muted">
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Reopen
              </button>
            )}
          </div>
        )}

        {sceneOptions.length > 0 && asset.source !== "provider-request" && asset.status === "ready" && (
          <AssignScenes asset={asset} sceneOptions={sceneOptions} />
        )}
        {asset.source === "provider-request" && (
          <p className="text-xs text-muted-text">Request drafts have no media yet — generate or upload media to assign it.</p>
        )}

        <div className="flex gap-1.5">
          {compareMode && (
            <button
              type="button"
              onClick={onToggleCompare}
              aria-pressed={compared}
              className={cx("inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium", compared ? "border-primary bg-primary/10" : "border-border hover:bg-muted")}
            >
              <Columns2 className="size-3.5" aria-hidden="true" />
              {compared ? "Compared" : "Compare"}
            </button>
          )}
          {confirmDelete ? (
            <span className="inline-flex items-center gap-1.5 text-xs">
              <span className="text-muted-text">Delete?</span>
              <button type="button" onClick={() => removeAsset(asset.id)} className="font-medium text-destructive underline">Yes</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="text-muted-text underline">Keep</button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} aria-label={`Delete ${asset.title}`} className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-destructive hover:bg-destructive/10">
              <Trash2 className="size-3.5" aria-hidden="true" />
              Delete
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function AssignScenes({ asset, sceneOptions }: { asset: MediaAsset; sceneOptions: { id: string; title: string }[] }) {
  const { assignScenes } = useMedia();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-muted"
      >
        Assign to scenes ({asset.sceneIds.length})
      </button>
      {open && (
        <ul className="absolute z-20 mt-1 max-h-48 w-56 overflow-y-auto rounded-lg border border-border bg-elevated p-1 shadow-lg" aria-label="Scenes">
          {sceneOptions.map((s) => {
            const on = asset.sceneIds.includes(s.id);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() =>
                    assignScenes(asset.id, on ? asset.sceneIds.filter((x) => x !== s.id) : [...asset.sceneIds, s.id])
                  }
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted"
                >
                  <span aria-hidden="true" className={cx("flex size-4 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                    {on && <Check className="size-3" />}
                  </span>
                  {s.title}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Library: search, filters, grid, side-by-side compare. */
export function LibraryView({ projectId, sceneOptions }: { projectId: string; sceneOptions: { id: string; title: string }[] }) {
  const { assetsFor } = useMedia();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | MediaKind>("all");
  const [status, setStatus] = useState<"all" | "active" | "ready" | "failed">("all");
  const [compareMode, setCompareMode] = useState(false);
  const [comparedIds, setComparedIds] = useState<string[]>([]);

  const assets = assetsFor(projectId);
  const shown = assets.filter((a) => {
    if (kind !== "all" && a.kind !== kind) return false;
    if (status === "active" && !["pending", "preparing", "generating", "processing"].includes(a.status)) return false;
    if (status === "ready" && a.status !== "ready") return false;
    if (status === "failed" && a.status !== "failed") return false;
    const q = query.trim().toLowerCase();
    if (q && ![a.title, a.kind, a.source, ...a.tags].join(" ").toLowerCase().includes(q)) return false;
    return true;
  });
  const compared = shown.filter((a) => comparedIds.includes(a.id)).slice(0, 2);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 sm:max-w-sm">
          <Search value={query} onChange={setQuery} placeholder="Search title, kind, tags…" label="Search assets" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Dropdown label="Kind" value={kind} onChange={(v) => setKind(v as typeof kind)} options={[{ id: "all", label: "All kinds" }, { id: "image", label: "Images" }, { id: "video", label: "Video" }, { id: "voice", label: "Voice" }, { id: "music", label: "Music" }, { id: "sfx", label: "SFX" }]} />
          <Dropdown label="Status" value={status} onChange={(v) => setStatus(v as typeof status)} options={[{ id: "all", label: "All states" }, { id: "active", label: "Active" }, { id: "ready", label: "Ready" }, { id: "failed", label: "Failed" }]} />
          <button
            type="button"
            onClick={() => {
              setCompareMode((m) => !m);
              setComparedIds([]);
            }}
            aria-pressed={compareMode}
            className={cx("inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium", compareMode ? "border-primary bg-primary/10" : "border-border hover:bg-muted")}
          >
            <Columns2 className="size-4" aria-hidden="true" />
            Compare
          </button>
        </div>
      </div>

      {compared.length === 2 && (
        <section aria-label="Side-by-side comparison" className="rounded-xl border border-primary/40 p-4">
          <h3 className="text-sm font-semibold">Side by side — you choose the keeper</h3>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {compared.map((a) => (
              <div key={a.id}>
                <AssetPreview asset={a} blobUrl={null} />
                <p className="mt-1 truncate text-sm font-medium">{a.title}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {assets.length === 0 ? (
        <EmptyState
          title="Library is empty"
          body="Generate with Gemini, make on-device drafts, or upload files. Everything here belongs to this project."
        />
      ) : shown.length === 0 ? (
        <EmptyState title="No assets match" body="Try a different search or filter." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Assets">
          {shown.map((a) => (
            <li key={a.id}>
              <AssetCard
                asset={a}
                sceneOptions={sceneOptions}
                compareMode={compareMode}
                compared={comparedIds.includes(a.id)}
                onToggleCompare={() =>
                  setComparedIds((prev) => (prev.includes(a.id) ? prev.filter((x) => x !== a.id) : [...prev, a.id].slice(-2)))
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
