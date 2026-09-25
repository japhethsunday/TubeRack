"use client";

import { useState } from "react";
import { Search, Plus, ExternalLink } from "lucide-react";
import { searchYouTube, type YouTubeSearchResult } from "@/src/lib/ai-client";
import { Input } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";
import { Alert } from "@/src/components/ui/Alert";
import { VideoDetailsPanel } from "@/src/components/intelligence/VideoDetailsPanel";
import { useIntel } from "@/src/components/intelligence/IntelProvider";

/** YouTube returns HTML-escaped titles (&#39; &amp;); decode as text, never as markup. */
export function decodeEntities(value: string): string {
  if (typeof DOMParser === "undefined") return value;
  return new DOMParser().parseFromString(value, "text/html").documentElement.textContent ?? value;
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/**
 * Live YouTube keyword research (Data API via /api/v1/youtube/search).
 * Real titles, channels, and public view counts — nothing estimated.
 * Optional `onAdd` lets a studio pull a result in as a reference.
 */
const SAVE_KEY = "youtube-research-last";

export function YouTubeResearch({
  initialQuery = "",
  onAdd,
  addLabel = "Add as reference",
}: {
  initialQuery?: string;
  onAdd?: (result: YouTubeSearchResult) => void;
  addLabel?: string;
}) {
  // The last search is saved to the account, so it is still here on return.
  const intel = useIntel();
  const saved = (() => {
    try {
      const raw = intel.outputFor("_workspace", SAVE_KEY)?.text;
      return raw ? (JSON.parse(raw) as { query: string; results: YouTubeSearchResult[] }) : null;
    } catch {
      return null;
    }
  })();
  const [queryDraft, setQuery] = useState<string | null>(initialQuery || null);
  const query = queryDraft ?? saved?.query ?? "";
  const [freshResults, setResults] = useState<YouTubeSearchResult[] | null>(null);
  const results = freshResults ?? (queryDraft === null || queryDraft === saved?.query ? saved?.results ?? null : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);

  async function run(event?: React.FormEvent) {
    event?.preventDefault();
    if (!query.trim() || loading) return;
    setLoading(true);
    setError(null);
    const outcome = await searchYouTube(query.trim(), 12);
    setLoading(false);
    if (outcome.ok) {
      setResults(outcome.data.results);
      intel.saveOutputFor("_workspace", SAVE_KEY, JSON.stringify({ query: query.trim(), results: outcome.data.results }), "YouTube research");
    }
    else {
      setResults(null);
      setError(outcome.message);
    }
  }

  return (
    <section aria-label="YouTube research" className="space-y-3">
      <form onSubmit={run} className="flex items-end gap-2">
        <div className="flex-1">
          <Input label="Search YouTube" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. faceless youtube channel ideas" />
        </div>
        <Button type="submit" disabled={!query.trim() || loading}>
          <Search className="size-4" aria-hidden="true" />
          {loading ? "Searching…" : "Search"}
        </Button>
      </form>
      {error && (
        <Alert tone="warn" title="YouTube search unavailable">
          {error}
        </Alert>
      )}
      {results && results.length === 0 && <p className="text-sm text-muted-text">No videos found for that query.</p>}
      {results && results.length > 0 && (
        <ul className="space-y-2" aria-label="YouTube results">
          {results.map((r) => (
            <li key={r.videoId} className="flex gap-3 rounded-lg border border-border bg-surface p-2.5">
              {r.thumbnail && (
                <button type="button" onClick={() => setOpenId(r.videoId)} aria-label={`Open details: ${decodeEntities(r.title)}`} className="group relative shrink-0 overflow-hidden rounded-md">
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnail; no optimizer domain configured. */}
                  <img src={r.thumbnail} alt="" className="aspect-video w-32 object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-[10px] font-semibold text-white opacity-0 transition-all duration-300 group-hover:bg-black/40 group-hover:opacity-100">View details</span>
                </button>
              )}
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => setOpenId(r.videoId)} className="line-clamp-2 text-left text-sm font-medium hover:text-violet-600 dark:hover:text-violet-300">
                  {decodeEntities(r.title)}
                </button>
                <p className="mt-0.5 truncate text-xs text-muted-text">
                  {r.channelTitle}
                  {r.publishedAt ? ` · ${new Date(r.publishedAt).toLocaleDateString()}` : ""}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {r.views !== undefined && <Badge tone="neutral">{compact.format(r.views)} views</Badge>}
                  {r.likes !== undefined && <Badge tone="neutral">{compact.format(r.likes)} likes</Badge>}
                  {onAdd && (
                    <button
                      type="button"
                      disabled={added.has(r.videoId)}
                      onClick={() => {
                        onAdd(r);
                        setAdded((s) => new Set(s).add(r.videoId));
                      }}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
                    >
                      <Plus className="size-3.5" aria-hidden="true" />
                      {added.has(r.videoId) ? "Added" : addLabel}
                    </button>
                  )}
                  <a
                    href={`https://www.youtube.com/watch?v=${r.videoId}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open on YouTube`}
                    className="inline-flex h-7 items-center rounded-md px-1.5 text-muted-text hover:bg-muted"
                  >
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {openId && (
        <VideoDetailsPanel
          videoId={openId}
          onClose={() => setOpenId(null)}
          addLabel={addLabel}
          onAdd={
            onAdd
              ? (d) => {
                  const r = results?.find((x) => x.videoId === d.id);
                  onAdd(
                    r ?? {
                      videoId: d.id,
                      title: d.title,
                      channelTitle: d.channel?.title ?? "",
                      channelId: d.channel?.id ?? "",
                      publishedAt: d.publishedAt,
                      description: d.description,
                      thumbnail: d.thumbnail,
                      views: d.stats.views,
                      likes: d.stats.likes,
                      comments: d.stats.comments,
                    },
                  );
                  setAdded((prev) => new Set(prev).add(d.id));
                }
              : undefined
          }
        />
      )}
      <p className="text-xs text-muted-text">Live data from the YouTube Data API. Requires sign-in; each search uses API quota.</p>
    </section>
  );
}
