"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2, Flame, Users, CalendarDays, Film } from "lucide-react";
import { growth, type CompetitorReport, type CompetitorRow } from "@/src/lib/growth-client";
import { Input } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";
import { GeminiAssist } from "@/src/components/intelligence/GeminiAssist";
import { VideoDetailsPanel } from "@/src/components/intelligence/VideoDetailsPanel";
import { cx } from "@/src/components/ui/cx";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

function StatTile({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-2.5 py-2">
      <p className="flex items-center gap-1 text-[11px] text-muted-text"><Icon className="size-3" aria-hidden="true" /> {label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ChannelCard({ report, onRemove, onOpen }: { report: CompetitorReport; onRemove: () => void; onOpen: (id: string) => void }) {
  const c = report.competitor;
  const s = report.stats;
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? report.uploads : report.uploads.slice(0, 6);
  return (
    <li className="ui-lift space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- remote channel avatar. */}
        {c.thumbnail && <img src={c.thumbnail} alt="" className="size-10 rounded-full" />}
        <div className="min-w-0 flex-1">
          <a href={`https://www.youtube.com/channel/${c.channel_id}`} target="_blank" rel="noreferrer" className="font-semibold hover:underline">{c.title}</a>
          <p className="text-xs text-muted-text">{c.subscribers === null ? "Subscribers hidden" : `${compact.format(c.subscribers)} subscribers`}</p>
        </div>
        {report.newOutliers.length > 0 && <Badge tone="ok">{report.newOutliers.length} new breakout{report.newOutliers.length > 1 ? "s" : ""}</Badge>}
        <button type="button" onClick={onRemove} aria-label={`Stop tracking ${c.title}`} className="rounded-md p-1.5 text-muted-text transition-colors hover:bg-muted hover:text-destructive">
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>
      {report.error ? (
        <p role="alert" className="text-sm text-destructive">{report.error}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile icon={Users} label="Median views (last 20)" value={compact.format(s.medianViews)} />
            <StatTile icon={CalendarDays} label="Uploads / week" value={String(s.uploadsPerWeek)} />
            <StatTile icon={Flame} label="Outliers (≥3×)" value={String(s.outliers.length)} />
            <StatTile icon={Film} label="Shorts share" value={`${Math.round(s.shortsShare * 100)}%`} />
          </div>
          {s.lastUploadDaysAgo !== null && <p className="text-xs text-muted-text">Last upload {s.lastUploadDaysAgo === 0 ? "today" : `${s.lastUploadDaysAgo} days ago`}.</p>}
          {report.keywords.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-text">{s.outliers.length >= 2 ? "Words in their breakouts:" : "Recurring title words:"}</span>
              {report.keywords.map((k) => <Badge key={k.word} tone="neutral">{k.word} ×{k.count}</Badge>)}
            </p>
          )}
          <ul className="space-y-1.5">
            {list.map((u) => (
              <li key={u.id}>
                <button type="button" onClick={() => onOpen(u.id)} className="flex w-full items-center gap-3 rounded-lg p-1 text-left transition-colors hover:bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnail. */}
                  <img src={u.thumbnail} alt="" className="aspect-video w-24 shrink-0 rounded object-cover" loading="lazy" />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 text-sm">{u.title}</span>
                    <span className="block text-xs text-muted-text">{compact.format(u.views)} views · {new Date(u.publishedAt).toLocaleDateString()}</span>
                  </span>
                  <span className={cx("shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums", u.multiple >= 3 ? "bg-success/15 text-success" : u.multiple >= 1 ? "bg-muted" : "text-muted-text")}>
                    {u.multiple.toFixed(1)}×
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {report.uploads.length > 6 && (
            <Button size="sm" variant="outline" onClick={() => setShowAll((v) => !v)}>{showAll ? "Show less" : `Show all ${report.uploads.length}`}</Button>
          )}
        </>
      )}
    </li>
  );
}

/** Track competitor channels: breakout detection, cadence, title patterns, Gemini readout. */
export function CompetitorTracker() {
  const [rows, setRows] = useState<CompetitorRow[] | null>(null);
  const [reports, setReports] = useState<CompetitorReport[] | null>(null);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [videoId, setVideoId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const o = await growth.competitorReport();
    setRefreshing(false);
    if (o.ok) setReports(o.data);
    else setError(o.message);
  }, []);

  useEffect(() => {
    void (async () => {
      const o = await growth.competitors();
      if (!o.ok) return setError(o.message);
      setRows(o.data);
      if (o.data.length) await refresh();
    })();
  }, [refresh]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setAdding(true);
    setError("");
    const o = await growth.addCompetitor(input.trim());
    setAdding(false);
    if (!o.ok) return setError(o.message);
    setInput("");
    setRows((r) => [...(r ?? []), o.data]);
    await refresh();
  }

  async function remove(id: string) {
    const o = await growth.removeCompetitor(id);
    if (!o.ok) return setError(o.message);
    setRows((r) => (r ?? []).filter((x) => x.id !== id));
    setReports((r) => (r ?? []).filter((x) => x.competitor.id !== id));
  }

  const breakouts = (reports ?? []).flatMap((r) => r.stats.outliers.slice(0, 3).map((o) => ({ channel: r.competitor.title, title: o.title, views: o.views, multiple: Number(o.multiple.toFixed(1)) })));

  return (
    <div className="space-y-5">
      <form onSubmit={(e) => void add(e)} className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface p-4">
        <div className="min-w-0 flex-1">
          <Input label="Add a channel" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Channel URL, @handle, or channel ID" />
        </div>
        <Button type="submit" loading={adding}><Plus className="size-4" aria-hidden="true" /> Track</Button>
        {rows && rows.length > 0 && (
          <Button type="button" variant="outline" loading={refreshing} onClick={() => void refresh()}><RefreshCw className="size-4" aria-hidden="true" /> Refresh</Button>
        )}
      </form>
      <p className="text-xs text-muted-text">
        A breakout (outlier) is a video with at least 3× the channel&apos;s own median views across its last 20 uploads. New breakouts trigger a notification, and tracked channels are re-checked every morning.
      </p>
      {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      {breakouts.length > 0 && (
        <GeminiAssist
          task="competitive-analysis"
          title="What's working for your competitors"
          blurb="Gemini reads the real breakout videos above and explains the patterns you can borrow, plus the gaps they leave open."
          context={{ breakouts, channels: (reports ?? []).map((r) => ({ title: r.competitor.title, medianViews: r.stats.medianViews, uploadsPerWeek: r.stats.uploadsPerWeek, shortsShare: r.stats.shortsShare, keywords: r.keywords.map((k) => k.word) })) }}
        />
      )}

      {rows === null ? (
        <p className="text-sm text-muted-text">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-text">Track up to 15 channels in your niche to catch their breakout videos early.</p>
      ) : reports === null ? (
        <p className="text-sm text-muted-text">Loading channel data…</p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {reports.map((r) => <ChannelCard key={r.competitor.id} report={r} onRemove={() => void remove(r.competitor.id)} onOpen={setVideoId} />)}
        </ul>
      )}
      {videoId && <VideoDetailsPanel videoId={videoId} onClose={() => setVideoId(null)} />}
    </div>
  );
}
