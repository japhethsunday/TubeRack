"use client";

import { useState } from "react";
import { Check, Copy, Library, Plus, Search, Trash2 } from "lucide-react";
import { api, ApiError } from "@/src/lib/api";
import { useMedia } from "@/src/components/media/MediaProvider";
import { MediaPlayer } from "@/src/components/media/players";
import type { MediaAsset } from "@/src/lib/media/types";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/fields";
import { Alert } from "@/src/components/ui/Alert";
import { cx } from "@/src/components/ui/cx";

const MOODS = [
  { id: "piano", label: "Piano" },
  { id: "keyboard", label: "Keyboard" },
  { id: "motivational", label: "Motivational" },
  { id: "inspirational", label: "Inspirational" },
  { id: "cinematic", label: "Cinematic" },
  { id: "lofi", label: "Lo-fi" },
  { id: "ambient", label: "Ambient" },
  { id: "corporate", label: "Upbeat" },
] as const;

interface LibraryTrack {
  id: string;
  title: string;
  creator: string;
  source: string;
  license: string;
  licenseUrl: string;
  attribution: string;
  durationSec: number | null;
  previewUrl: string;
  fileType: string;
}

function fmt(sec: number | null): string {
  if (!sec) return "";
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/**
 * Background music from open libraries: instrumental only, licensed for
 * commercial use (fine for monetized YouTube). Adding a track copies it into
 * the project and keeps its credit line for the video description.
 */
export function MusicLibrary({
  projectId,
  onAdded,
  onRemoved,
}: {
  projectId: string;
  onAdded?: (asset: MediaAsset) => void;
  /** Called after a track is removed from the project (e.g. to clear it from the timeline). */
  onRemoved?: (assetId: string) => void;
}) {
  const { addAsset, assetsFor, removeAsset } = useMedia();
  const [mood, setMood] = useState<string>("piano");
  const [extra, setExtra] = useState("");
  const [page, setPage] = useState(1);
  const [tracks, setTracks] = useState<LibraryTrack[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const added = assetsFor(projectId).filter((a) => a.kind === "music" && a.tags.includes("library"));
  const addedIds = new Set(added.flatMap((a) => a.tags.filter((t) => t.startsWith("track:")).map((t) => t.slice(6))));

  async function search(nextMood = mood, nextPage = 1) {
    setMood(nextMood);
    setPage(nextPage);
    setBusy(true);
    setError(null);
    try {
      const q = new URLSearchParams({ mood: nextMood, page: String(nextPage) });
      if (extra.trim()) q.set("q", extra.trim());
      const data = await api.get<{ tracks: LibraryTrack[] }>(`/api/v1/music/search?${q}`);
      setTracks(data.tracks);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The music library couldn't be reached. Please try again.");
    }
    setBusy(false);
  }

  async function add(track: LibraryTrack) {
    setAdding(track.id);
    setError(null);
    try {
      const data = await api.post<{ url: string; mime: string; fileSize: number }>("/api/v1/music/import", { id: track.id });
      const asset = addAsset({
        projectId,
        sceneIds: [],
        kind: "music",
        source: "provider-output",
        status: "ready",
        title: `${track.title} — ${track.creator}`,
        payload: data.url,
        mime: data.mime,
        durationSec: track.durationSec ?? undefined,
        fileSize: data.fileSize,
        tags: ["library", `track:${track.id}`, `license:${track.license}`, `credit:${track.attribution}`],
        approval: "draft",
      });
      onAdded?.(asset);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't add this track. Please try another one.");
    }
    setAdding(null);
  }

  const credits = added
    .map((a) => a.tags.find((t) => t.startsWith("credit:"))?.slice(7))
    .filter(Boolean)
    .join("\n");

  return (
    <section aria-label="Music library" className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Library className="size-4 text-muted-text" aria-hidden="true" /> Royalty-free music library
        </h3>
        <p className="mt-1 text-xs text-muted-text">
          Instrumental tracks (no vocals) licensed for commercial use, so they&apos;re safe for monetized videos. Credit the artist in your description — the credit line is kept for you.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Mood">
        {MOODS.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={mood === m.id && tracks !== null}
            onClick={() => void search(m.id)}
            className={cx(
              "h-8 rounded-full border px-3 text-xs font-medium",
              mood === m.id && tracks !== null ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search(mood);
        }}
      >
        <div className="min-w-0 flex-1">
          <Input label="Refine (optional)" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="e.g. calm, uplifting, epic, sad" />
        </div>
        <Button type="submit" variant="secondary" loading={busy}>
          <Search className="size-4" aria-hidden="true" /> Search
        </Button>
      </form>

      {error && <Alert tone="bad" title="Music library">{error}</Alert>}

      {tracks && tracks.length === 0 && !busy && <p className="text-sm text-muted-text">No instrumental tracks found for that — try another mood or word.</p>}

      {tracks && tracks.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {tracks.map((t) => {
            const isAdded = addedIds.has(t.id);
            const addedAsset = added.find((a) => a.tags.includes(`track:${t.id}`));
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="truncate text-xs text-muted-text">
                    {t.creator} · {t.license}
                    {t.durationSec ? ` · ${fmt(t.durationSec)}` : ""}
                  </p>
                </div>
                <MediaPlayer url={t.previewUrl} mime={t.fileType === "wav" ? "audio/wav" : "audio/mpeg"} label={`Preview ${t.title}`} />
                {isAdded && addedAsset ? (
                  <div className="flex items-center gap-1.5">
                    {onAdded && (
                      <Button size="sm" variant="outline" onClick={() => onAdded(addedAsset)}>
                        <Plus className="size-4" aria-hidden="true" /> Add again
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`Remove ${t.title} from the project`}
                      onClick={() => {
                        removeAsset(addedAsset.id);
                        onRemoved?.(addedAsset.id);
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden="true" /> Remove
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="primary" loading={adding === t.id} onClick={() => void add(t)}>
                    <Plus className="size-4" aria-hidden="true" /> Add to project
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {tracks && tracks.length > 0 && (
        <div className="flex gap-2">
          {page > 1 && (
            <Button size="sm" variant="ghost" onClick={() => void search(mood, page - 1)} disabled={busy}>
              Previous
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => void search(mood, page + 1)} disabled={busy}>
            More tracks
          </Button>
        </div>
      )}

      {credits && (
        <div className="rounded-lg border border-border bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold">Music credits for your description</p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                void navigator.clipboard?.writeText(`Music:\n${credits}`).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <pre className="mt-1 whitespace-pre-wrap text-xs text-muted-text">{credits}</pre>
        </div>
      )}
    </section>
  );
}
