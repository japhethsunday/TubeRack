import { ImageIcon, Check, Loader2, OctagonX, Trash2, Replace } from "lucide-react";
import { Badge } from "@/src/components/ui/Badge";
import { cx } from "@/src/components/ui/cx";

export type AssetStatus = "ready" | "processing" | "failed" | "selected";

const statusMeta: Record<AssetStatus, { label: string; tone: "ok" | "info" | "bad" | "neutral" }> = {
  ready: { label: "Ready", tone: "ok" },
  processing: { label: "Processing", tone: "info" },
  failed: { label: "Failed", tone: "bad" },
  selected: { label: "Selected", tone: "neutral" },
};

export interface MediaAsset {
  id: string;
  title: string;
  kind: string;
  meta: string;
  status: AssetStatus;
}

/** Reusable media card: preview, metadata, status, selection, actions. */
export function MediaCard({ asset }: { asset: MediaAsset }) {
  const meta = statusMeta[asset.status];
  const StatusIcon =
    asset.status === "ready" || asset.status === "selected"
      ? Check
      : asset.status === "processing"
        ? Loader2
        : OctagonX;
  return (
    <article
      aria-label={asset.title}
      className={cx(
        "group overflow-hidden rounded-xl border bg-surface transition-colors duration-150",
        asset.status === "selected" ? "border-primary" : "border-border hover:border-muted-text/50",
      )}
    >
      <div className="flex aspect-video items-center justify-center bg-muted">
        <ImageIcon className="size-8 text-disabled-text" aria-hidden="true" />
        {asset.status === "processing" && (
          <span role="status" className="absolute rounded-full bg-black/60 px-2 py-1 text-[11px] text-white">
            Processing…
          </span>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="truncate text-sm font-medium">{asset.title}</h4>
            <p className="mt-0.5 text-xs text-muted-text">
              {asset.kind} · {asset.meta}
            </p>
          </div>
          <Badge tone={meta.tone}>
            <StatusIcon
              aria-hidden="true"
              className={cx("size-3", asset.status === "processing" && "animate-spin")}
            />
            {meta.label}
          </Badge>
        </div>
        <div className="mt-2 flex gap-1 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            aria-label={`Select ${asset.title}`}
            className="rounded-md px-2 py-1 text-xs font-medium text-muted-text hover:bg-muted hover:text-foreground"
          >
            Select
          </button>
          <button
            type="button"
            aria-label={`Replace ${asset.title}`}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-text hover:bg-muted hover:text-foreground"
          >
            <Replace className="size-3" aria-hidden="true" />
            Replace
          </button>
          <button
            type="button"
            aria-label={`Delete ${asset.title}`}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="size-3" aria-hidden="true" />
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

/** Responsive asset grid: 2 → 3 → 4 columns. */
export function AssetGrid({ assets }: { assets: MediaAsset[] }) {
  return (
    <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4" aria-label="Assets">
      {assets.map((a) => (
        <li key={a.id}>
          <MediaCard asset={a} />
        </li>
      ))}
    </ul>
  );
}
