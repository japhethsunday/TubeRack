"use client";

import { useState } from "react";
import { Check, Film, ImageIcon, Loader2, Plus, Search } from "lucide-react";
import { api, ApiError } from "@/src/lib/api";
import { useMedia } from "@/src/components/media/MediaProvider";
import type { MediaAsset } from "@/src/lib/media/types";
import { Alert } from "@/src/components/ui/Alert";
import { cx } from "@/src/components/ui/cx";

interface StockItem {
  id: string;
  kind: "video" | "photo";
  title: string;
  author: string;
  pageUrl: string;
  thumbnail: string;
  previewVideo: string | null;
  width: number;
  height: number;
  durationSec: number | null;
}

const IDEAS = ["city at night", "nature", "office work", "money", "technology", "ocean", "people talking", "sunrise"];

/**
 * Free stock footage and photos (Pixabay: free for commercial use, no credit
 * required). Adding one copies it into the project and, in the Video Studio,
 * places it on the timeline at the playhead.
 */
export function StockLibrary({
  projectId,
  orientation = "any",
  onAdded,
}: {
  projectId: string;
  orientation?: "any" | "horizontal" | "vertical";
  onAdded?: (asset: MediaAsset) => void;
}) {
  const { addAsset, assetsFor } = useMedia();
  const [kind, setKind] = useState<"video" | "photo">("video");
  const [query, setQuery] = useState("");
  const [shape, setShape] = useState(orientation);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<StockItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  // Stock items already imported into this project (re-adding reuses the stored copy).
  const imported = new Map<string, MediaAsset>();
  for (const a of assetsFor(projectId)) for (const t of a.tags) if (t.startsWith("stock:")) imported.set(t.slice(6), a);

  async function search(next: { q?: string; kind?: "video" | "photo"; page?: number } = {}) {
    const q = (next.q ?? query).trim();
    const k = next.kind ?? kind;
    const p = next.page ?? 1;
    if (q.length < 2) {
      setError("Type what you're looking for, e.g. “city at night”.");
      return;
    }
    setQuery(q);
    setKind(k);
    setPage(p);
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ kind: k, q, orientation: shape, page: String(p) });
      const data = await api.get<{ items: StockItem[] }>(`/api/v1/stock/search?${params}`);
      setItems(data.items);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The stock library couldn't be reached. Please try again.");
    }
    setBusy(false);
  }

  async function add(item: StockItem) {
    const existing = imported.get(item.id);
    if (existing) {
      onAdded?.(existing);
      return;
    }
    setAdding(item.id);
    setError(null);
    try {
      const data = await api.post<{ url: string; mime: string; fileSize: number }>("/api/v1/stock/import", { id: item.id });
      const asset = addAsset({
        projectId,
        sceneIds: [],
        kind: item.kind === "video" ? "video" : "image",
        source: "provider-output",
        status: "ready",
        title: item.title,
        payload: data.url,
        mime: data.mime,
        durationSec: item.durationSec ?? undefined,
        width: item.width || undefined,
        height: item.height || undefined,
        fileSize: data.fileSize,
        tags: ["stock", `stock:${item.id}`, "license:Pixabay Content License", `credit:${item.author ? `${item.author} on Pixabay` : "Pixabay"}`],
        approval: "draft",
      });
      onAdded?.(asset);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't add this item. Please try another one.");
    }
    setAdding(null);
  }

  return (
    <section aria-label="Stock videos and photos" className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-border p-0.5" role="tablist">
        {(
          [
            ["video", "Videos", Film],
            ["photo", "Photos", ImageIcon],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={kind === id}
            onClick={() => (items ? void search({ kind: id }) : setKind(id))}
            className={cx("flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium", kind === id ? "bg-muted text-foreground" : "text-muted-text hover:text-foreground")}
          >
            <Icon className="size-3.5" aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={kind === "video" ? "Search free stock footage" : "Search free stock photos"}
          aria-label="Search stock library"
          maxLength={100}
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 text-sm"
        />
        <button type="submit" disabled={busy} aria-label="Search" className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-60">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Search className="size-4" aria-hidden="true" />}
        </button>
      </form>

      <div className="flex items-center gap-1.5 text-[11px]">
        <span className="text-muted-text">Shape:</span>
        {(
          [
            ["any", "Any"],
            ["horizontal", "Wide"],
            ["vertical", "Tall"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={shape === id}
            onClick={() => setShape(id)}
            className={cx("rounded-full border px-2 py-0.5", shape === id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-text hover:bg-muted")}
          >
            {label}
          </button>
        ))}
      </div>

      {!items && !busy && (
        <div className="flex flex-wrap gap-1.5">
          {IDEAS.map((q) => (
            <button key={q} type="button" onClick={() => void search({ q })} className="rounded-full border border-border px-2 py-1 text-[11px] text-muted-text hover:bg-muted hover:text-foreground">
              {q}
            </button>
          ))}
        </div>
      )}

      {error && <Alert tone="bad" title="Stock library">{error}</Alert>}
      {items && items.length === 0 && !busy && <p className="text-xs text-muted-text">Nothing found — try a simpler word.</p>}

      {items && items.length > 0 && (
        <ul className="grid grid-cols-2 gap-2">
          {items.map((it) => {
            const added = imported.has(it.id);
            return (
              <li key={it.id} className="group overflow-hidden rounded-lg border border-border bg-background">
                <div className="relative aspect-video bg-muted" onMouseEnter={() => setHover(it.id)} onMouseLeave={() => setHover(null)}>
                  {hover === it.id && it.previewVideo ? (
                    <video src={it.previewVideo} autoPlay muted loop playsInline className="size-full object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- Pixabay preview.
                    <img src={it.thumbnail} alt={it.title} loading="lazy" decoding="async" className="size-full object-cover" />
                  )}
                  {it.durationSec !== null && <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] font-semibold text-white">{it.durationSec}s</span>}
                  <button
                    type="button"
                    onClick={() => void add(it)}
                    disabled={adding !== null || (added && !onAdded)}
                    aria-label={added ? (onAdded ? `Add ${it.title} to the timeline again` : `${it.title} added`) : `Add ${it.title}`}
                    className={cx(
                      "absolute left-1 top-1 flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-white shadow",
                      added ? "bg-success/90" : "bg-primary/90 opacity-90 hover:opacity-100",
                    )}
                  >
                    {adding === it.id ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : added ? <Check className="size-3" aria-hidden="true" /> : <Plus className="size-3" aria-hidden="true" />}
                    {adding === it.id ? "Adding" : added ? (onAdded ? "Add again" : "Added") : "Add"}
                  </button>
                </div>
                <p className="truncate px-1.5 py-1 text-[11px] text-muted-text" title={it.title}>
                  {it.title}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {items && items.length > 0 && (
        <div className="flex justify-between">
          <button type="button" disabled={page <= 1 || busy} onClick={() => void search({ page: page - 1 })} className="text-xs text-muted-text hover:text-foreground disabled:opacity-40">
            Previous
          </button>
          <button type="button" disabled={busy} onClick={() => void search({ page: page + 1 })} className="text-xs text-muted-text hover:text-foreground disabled:opacity-40">
            More results
          </button>
        </div>
      )}
      <p className="text-[10px] text-muted-text">Free stock from Pixabay — free for commercial use, no credit required.</p>
    </section>
  );
}
