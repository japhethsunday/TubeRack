"use client";

import { useEffect, useRef, useState } from "react";
import { X, Eye, ThumbsUp, MessageSquare, Clock, CalendarDays, Sparkles, Link2, Plus, Users, Film } from "lucide-react";
import { fetchYouTubeDetails, runProviderIntelligence, type VideoDetails } from "@/src/lib/ai-client";
import { downloadText, safeFileName } from "@/src/lib/download";
import { Tabs } from "@/src/components/ui/Tabs";
import { Badge } from "@/src/components/ui/Badge";
import { Button } from "@/src/components/ui/Button";
import { Skeleton } from "@/src/components/ui/feedback";
import { DownloadButton } from "@/src/components/ui/DownloadButton";
import { Portal } from "@/src/components/ui/Portal";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en");

/** YouTube's standard video category ids. */
const CATEGORIES: Record<string, string> = {
  "1": "Film & Animation", "2": "Autos & Vehicles", "10": "Music", "15": "Pets & Animals", "17": "Sports",
  "19": "Travel & Events", "20": "Gaming", "22": "People & Blogs", "23": "Comedy", "24": "Entertainment",
  "25": "News & Politics", "26": "Howto & Style", "27": "Education", "28": "Science & Technology", "29": "Nonprofits & Activism",
};

function duration(sec: number | null): string {
  if (sec === null) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** Exact (fractional) days since upload, never below one hour. */
function daysSince(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Math.max(1 / 24, (Date.now() - t) / 86400000) : 1;
}

function ago(iso: string): string {
  const days = daysSince(iso);
  if (days < 1) return `${Math.max(1, Math.round(days * 24))} hours ago`;
  if (days < 60) return `${Math.floor(days)} day${Math.floor(days) === 1 ? "" : "s"} ago`;
  if (days < 730) return `${Math.floor(days / 30.44)} months ago`;
  return `${Math.floor(days / 365.25)} years ago`;
}

function pct(part?: number, whole?: number): string {
  if (part === undefined || !whole) return "—";
  const v = (part / whole) * 100;
  if (v === 0) return "0%";
  // Keep two significant digits so tiny rates (e.g. 0.0004%) are not shown as 0.00%.
  return `${v >= 1 ? v.toFixed(2) : v.toPrecision(2)}%`;
}

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Eye; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-text">
        <Icon className="size-3.5" aria-hidden="true" /> {label}
      </p>
      <p className="mt-1 truncate text-lg font-semibold tabular-nums" title={value}>{value}</p>
      {hint && <p className="text-[11px] text-muted-text">{hint}</p>}
    </div>
  );
}

export function detailsToMarkdown(d: VideoDetails): string {
  const lines = [
    `# ${d.title}`,
    `https://www.youtube.com/watch?v=${d.id}`,
    "",
    `- Channel: ${d.channel?.title ?? "—"}${d.channel?.subscribers !== undefined ? ` (${full.format(d.channel.subscribers)} subscribers)` : ""}`,
    `- Published: ${new Date(d.publishedAt).toLocaleString()}`,
    `- Duration: ${duration(d.durationSec)}`,
    `- Views: ${d.stats.views !== undefined ? full.format(d.stats.views) : "—"}`,
    `- Likes: ${d.stats.likes !== undefined ? full.format(d.stats.likes) : "—"}`,
    `- Comments: ${d.stats.comments !== undefined ? full.format(d.stats.comments) : "—"}`,
    `- Like rate: ${pct(d.stats.likes, d.stats.views)} · Comment rate: ${pct(d.stats.comments, d.stats.views)}`,
    `- Definition: ${d.definition.toUpperCase() || "—"} · Captions: ${d.captions ? "yes" : "no"}`,
    "",
    "## Tags",
    d.tags.length ? d.tags.join(", ") : "(none)",
    "",
    "## Description",
    d.description || "(empty)",
    "",
    "## Top comments",
    ...d.comments.map((c) => `- ${c.author} (${c.likes} likes): ${c.text.replace(/\s+/g, " ")}`),
  ];
  return lines.join("\n");
}

/**
 * Full in-app view of a YouTube video: player, stats, description, tags,
 * channel, comments, technical details, and Gemini analysis. All numbers
 * are the public figures the Data API returns.
 */
export function VideoDetailsPanel({
  videoId,
  onClose,
  onAdd,
  addLabel = "Add as reference",
}: {
  videoId: string;
  onClose: () => void;
  onAdd?: (d: VideoDetails) => void;
  addLabel?: string;
}) {
  const [details, setDetails] = useState<VideoDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [added, setAdded] = useState(false);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    void fetchYouTubeDetails(videoId).then((o) => {
      if (!alive) return;
      if (o.ok) setDetails(o.data);
      else setError(o.message);
    });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [videoId]);

  async function analyze() {
    if (!details) return;
    setAnalyzing(true);
    setAnalysisError(null);
    const outcome = await runProviderIntelligence("competitive-analysis", {
      input: `Break down why this YouTube video performs the way it does and what a creator can learn from it.`,
      video: {
        title: details.title,
        channel: details.channel?.title,
        subscribers: details.channel?.subscribers,
        views: details.stats.views,
        likes: details.stats.likes,
        comments: details.stats.comments,
        durationSec: details.durationSec,
        publishedAt: details.publishedAt,
        tags: details.tags.slice(0, 30),
        description: details.description.slice(0, 3000),
        topComments: details.comments.slice(0, 8).map((c) => c.text.slice(0, 300)),
      },
    });
    setAnalyzing(false);
    if (outcome.ok) setAnalysis(outcome.data.text);
    else setAnalysisError(outcome.message);
  }

  const d = details;
  const perDay = d?.stats.views !== undefined ? Math.round(d.stats.views / daysSince(d.publishedAt)) : undefined;

  return (
    <Portal>
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Video details">
      <div aria-hidden="true" onClick={onClose} className="ui-overlay absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="ui-modal relative flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-border bg-elevated shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <h2 className="line-clamp-2 text-base font-semibold sm:text-lg">{d?.title ?? "Loading video…"}</h2>
            {d?.channel && <p className="mt-0.5 truncate text-xs text-muted-text">{d.channel.title}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-muted-text hover:bg-muted hover:text-foreground">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          {error ? (
            <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
          ) : !d ? (
            <div className="space-y-3">
              <Skeleton className="aspect-video w-full rounded-xl" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
                <div className="overflow-hidden rounded-xl border border-border bg-black">
                  {d.embeddable ? (
                    <iframe
                      className="aspect-video w-full"
                      src={`https://www.youtube-nocookie.com/embed/${d.id}?rel=0&modestbranding=1`}
                      title={d.title}
                      allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      loading="lazy"
                      referrerPolicy="strict-origin-when-cross-origin"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnail.
                    <img src={d.thumbnail} alt="" className="aspect-video w-full object-cover" />
                  )}
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Stat icon={Eye} label="Views" value={d.stats.views !== undefined ? full.format(d.stats.views) : "—"} hint={perDay !== undefined ? `≈${compact.format(perDay)}/day avg since upload` : undefined} />
                    <Stat icon={ThumbsUp} label="Likes" value={d.stats.likes !== undefined ? full.format(d.stats.likes) : "Hidden"} hint={d.stats.likes !== undefined ? `Like rate ${pct(d.stats.likes, d.stats.views)}` : "Owner hid likes"} />
                    <Stat icon={MessageSquare} label="Comments" value={d.stats.comments !== undefined ? full.format(d.stats.comments) : d.commentsDisabled ? "Off" : "—"} hint={`Comment rate ${pct(d.stats.comments, d.stats.views)}`} />
                    <Stat icon={Clock} label="Duration" value={duration(d.durationSec)} hint={d.durationSec !== null && d.durationSec <= 60 ? "Short" : d.definition.toUpperCase()} />
                  </div>
                  <p className="flex items-center gap-1.5 text-xs text-muted-text">
                    <CalendarDays className="size-3.5" aria-hidden="true" />
                    Published {new Date(d.publishedAt).toLocaleDateString(undefined, { dateStyle: "long" })} · {ago(d.publishedAt)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" loading={analyzing} onClick={() => void analyze()}>
                      <Sparkles className="size-3.5" aria-hidden="true" /> Analyze with Gemini
                    </Button>
                    {onAdd && (
                      <Button size="sm" variant="outline" disabled={added} onClick={() => { onAdd(d); setAdded(true); }}>
                        <Plus className="size-3.5" aria-hidden="true" /> {added ? "Added" : addLabel}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard?.writeText(`https://www.youtube.com/watch?v=${d.id}`);
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 1500);
                      }}
                    >
                      <Link2 className="size-3.5" aria-hidden="true" /> {copied ? "Copied" : "Copy link"}
                    </Button>
                    <DownloadButton label="Download details" onDownload={() => downloadText(detailsToMarkdown(d), safeFileName(d.title, "md"), "text/markdown")} />
                  </div>
                </div>
              </div>

              {(analysis || analysisError) && (
                <section aria-label="Gemini analysis" className="auth-rise space-y-2 rounded-xl border border-violet-400/30 bg-violet-500/5 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <Sparkles className="size-4 text-violet-500" aria-hidden="true" /> Gemini analysis
                    </h3>
                    {analysis && (
                      <DownloadButton size="xs" onDownload={() => downloadText(`# Analysis: ${d.title}\n\n${analysis}`, safeFileName(`${d.title} analysis`, "md"), "text/markdown")} />
                    )}
                  </div>
                  {analysisError ? (
                    <p className="text-sm text-destructive">{analysisError}</p>
                  ) : (
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">{analysis}</div>
                  )}
                </section>
              )}

              <Tabs
                tabs={[
                  {
                    id: "description",
                    label: "Description",
                    content: <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">{d.description || "No description."}</p>,
                  },
                  {
                    id: "tags",
                    label: "Tags",
                    badge: String(d.tags.length),
                    content:
                      d.tags.length === 0 ? (
                        <p className="text-sm text-muted-text">This video has no public tags.</p>
                      ) : (
                        <div className="space-y-3">
                          <ul className="flex flex-wrap gap-1.5">
                            {d.tags.map((t) => (
                              <li key={t}><Badge tone="neutral">{t}</Badge></li>
                            ))}
                          </ul>
                          <Button size="sm" variant="outline" onClick={() => void navigator.clipboard?.writeText(d.tags.join(", "))}>
                            Copy all tags
                          </Button>
                        </div>
                      ),
                  },
                  {
                    id: "channel",
                    label: "Channel",
                    content: d.channel ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          {d.channel.thumbnail && (
                            // eslint-disable-next-line @next/next/no-img-element -- remote YouTube avatar.
                            <img src={d.channel.thumbnail} alt="" className="size-14 rounded-full border border-border" />
                          )}
                          <div>
                            <p className="font-semibold">{d.channel.title}</p>
                            <p className="text-xs text-muted-text">
                              {d.channel.customUrl}
                              {d.channel.country ? ` · ${d.channel.country}` : ""}
                              {d.channel.publishedAt ? ` · since ${new Date(d.channel.publishedAt).getFullYear()}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <Stat icon={Users} label="Subscribers" value={d.channel.subscribersHidden ? "Hidden" : d.channel.subscribers !== undefined ? full.format(d.channel.subscribers) : "—"} />
                          <Stat icon={Eye} label="Total views" value={d.channel.totalViews !== undefined ? full.format(d.channel.totalViews) : "—"} />
                          <Stat icon={Film} label="Videos" value={d.channel.videoCount !== undefined ? full.format(d.channel.videoCount) : "—"} />
                        </div>
                        {d.channel.subscribers && d.stats.views ? (
                          <p className="text-xs text-muted-text">This video&apos;s views are {((d.stats.views / d.channel.subscribers) * 100).toFixed(0)}% of the channel&apos;s subscriber count.</p>
                        ) : null}
                        <p className="whitespace-pre-wrap text-sm text-foreground/80">{d.channel.description || "No channel description."}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-text">Channel details are unavailable.</p>
                    ),
                  },
                  {
                    id: "comments",
                    label: "Top comments",
                    badge: d.comments.length ? String(d.comments.length) : undefined,
                    content: d.commentsDisabled ? (
                      <p className="text-sm text-muted-text">Comments are turned off for this video.</p>
                    ) : d.comments.length === 0 ? (
                      <p className="text-sm text-muted-text">No public comments returned.</p>
                    ) : (
                      <ul className="space-y-3">
                        {d.comments.map((c, i) => (
                          <li key={i} className="flex gap-3 rounded-xl border border-border bg-surface p-3">
                            {c.authorImage && (
                              // eslint-disable-next-line @next/next/no-img-element -- remote YouTube avatar.
                              <img src={c.authorImage} alt="" className="size-8 shrink-0 rounded-full" loading="lazy" />
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-medium">
                                {c.author} <span className="font-normal text-muted-text">· {new Date(c.publishedAt).toLocaleDateString()}</span>
                              </p>
                              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{c.text}</p>
                              <p className="mt-1 text-[11px] text-muted-text">{full.format(c.likes)} likes · {c.replies} replies</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ),
                  },
                  {
                    id: "technical",
                    label: "Technical",
                    content: (
                      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                        {[
                          ["Video ID", d.id],
                          ["Definition", d.definition.toUpperCase() || "—"],
                          ["Captions", d.captions ? "Available" : "None"],
                          ["Language", d.defaultLanguage || "—"],
                          ["Category", d.categoryId ? `${CATEGORIES[d.categoryId] ?? "Other"} (${d.categoryId})` : "—"],
                          ["Licensed content", d.licensedContent ? "Yes" : "No"],
                          ["Made for kids", d.madeForKids === null ? "—" : d.madeForKids ? "Yes" : "No"],
                          ["Embeddable", d.embeddable ? "Yes" : "No"],
                          ["Topics", d.topics.join(", ") || "—"],
                        ].map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-3 border-b border-border py-1.5">
                            <dt className="text-muted-text">{k}</dt>
                            <dd className="text-right font-medium">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    ),
                  },
                ]}
              />
            </div>
          )}
        </div>
      </div>
    </div>
    </Portal>
  );
}
