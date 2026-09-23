"use client";

import { useState } from "react";
import { Search, Plus, ExternalLink } from "lucide-react";
import { searchYouTube, type YouTubeSearchResult } from "@/src/lib/ai-client";
import { Input } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";
import { Alert } from "@/src/components/ui/Alert";

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
export function YouTubeResearch({
  initialQuery = "",
  onAdd,
  addLabel = "Add as reference",
}: {
  initialQuery?: string;
  onAdd?: (result: YouTubeSearchResult) => void;
  addLabel?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<YouTubeSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  async function run(event?: React.FormEvent) {
    event?.preventDefault();
    if (!query.trim() || loading) return;
    setLoading(true);
    setError(null);
    const outcome = await searchYouTube(query.trim(), 12);
    setLoading(false);
    if (outcome.ok) setResults(outcome.data.results);
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
                // eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnail; no optimizer domain configured.
                <img src={r.thumbnail} alt="" className="aspect-video w-32 shrink-0 rounded-md object-cover" loading="lazy" />
              )}
              <div className="min-w-0 flex-1">
                <a
                  href={`https://www.youtube.com/watch?v=${r.videoId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="line-clamp-2 text-sm font-medium hover:underline"
                >
                  {decodeEntities(r.title)}
                </a>
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
      <p className="text-xs text-muted-text">Live data from the YouTube Data API. Requires sign-in; each search uses API quota.</p>
    </section>
  );
}
