"use client";

import { useEffect, useState } from "react";
import { Plus, Radar, Trash2, Mail, MailX, Zap } from "lucide-react";
import { growth, type TrendWatch } from "@/src/lib/growth-client";
import type { TrendResult } from "@/src/lib/growth/trends";
import { Input, Select } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";
import { GeminiAssist } from "@/src/components/intelligence/GeminiAssist";
import { VideoDetailsPanel } from "@/src/components/intelligence/VideoDetailsPanel";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const REGIONS = [["", "Worldwide"], ["US", "United States"], ["GB", "United Kingdom"], ["CA", "Canada"], ["AU", "Australia"], ["IN", "India"], ["NG", "Nigeria"], ["ZA", "South Africa"], ["KE", "Kenya"], ["GH", "Ghana"], ["DE", "Germany"], ["BR", "Brazil"], ["PH", "Philippines"]] as const;

const hasResults = (r: TrendWatch["last_results"]): r is TrendResult => "videos" in r;

function WatchCard({ watch, onChange, onRemove, onOpen }: { watch: TrendWatch; onChange: (w: TrendWatch) => void; onRemove: () => void; onOpen: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const r = hasResults(watch.last_results) ? watch.last_results : null;

  async function scan() {
    setBusy(true);
    setError("");
    const o = await growth.scanWatch(watch.id);
    setBusy(false);
    if (o.ok) onChange({ ...watch, last_results: o.data, last_run_at: o.data.ranAt });
    else setError(o.message);
  }

  async function toggle() {
    const o = await growth.toggleDigest(watch.id, !watch.email_digest);
    if (o.ok) onChange({ ...watch, email_digest: !watch.email_digest });
    else setError(o.message);
  }

  return (
    <li className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">“{watch.query}”</h3>
        {watch.region && <Badge tone="neutral">{watch.region}</Badge>}
        <span className="text-xs text-muted-text">{watch.last_run_at ? `Scanned ${new Date(watch.last_run_at).toLocaleString()}` : "Not scanned yet"}</span>
        <span className="ml-auto flex gap-1">
          <Button size="sm" loading={busy} onClick={() => void scan()}><Radar className="size-3.5" aria-hidden="true" /> Scan now</Button>
          <button type="button" onClick={() => void toggle()} aria-pressed={watch.email_digest} title={watch.email_digest ? "Daily email on" : "Daily email off"} aria-label={watch.email_digest ? "Turn off daily email" : "Turn on daily email"} className="rounded-md p-1.5 text-muted-text transition-colors hover:bg-muted hover:text-foreground">
            {watch.email_digest ? <Mail className="size-4" aria-hidden="true" /> : <MailX className="size-4" aria-hidden="true" />}
          </button>
          <button type="button" onClick={onRemove} aria-label={`Stop watching ${watch.query}`} className="rounded-md p-1.5 text-muted-text transition-colors hover:bg-muted hover:text-destructive">
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        </span>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {r && (
        <>
          {r.phrases.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-text">Rising phrases:</span>
              {r.phrases.map((p) => <Badge key={p.phrase} tone="info">{p.phrase} ×{p.count}</Badge>)}
            </p>
          )}
          <p className="text-xs text-muted-text">Median velocity: {compact.format(r.medianViewsPerHour)} views/hour across this week&apos;s top uploads.</p>
          <ol className="space-y-1.5">
            {r.videos.slice(0, 10).map((v, i) => (
              <li key={v.videoId}>
                <button type="button" onClick={() => onOpen(v.videoId)} className="flex w-full items-center gap-3 rounded-lg p-1 text-left transition-colors hover:bg-muted">
                  <span className="w-5 shrink-0 text-center text-xs text-muted-text">{i + 1}</span>
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnail. */}
                  <img src={v.thumbnail} alt="" className="aspect-video w-24 shrink-0 rounded object-cover" loading="lazy" />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 text-sm">{v.title}</span>
                    <span className="block text-xs text-muted-text">
                      {v.channelTitle}{v.channelSubs !== null && ` · ${compact.format(v.channelSubs)} subs`} · {compact.format(v.views)} views · {new Date(v.publishedAt).toLocaleDateString()}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums"><Zap className="size-3 text-warning" aria-hidden="true" />{compact.format(v.viewsPerHour)}/h</span>
                  {v.isNew && <Badge tone="ok">New</Badge>}
                </button>
              </li>
            ))}
          </ol>
          <GeminiAssist
            task="topic-discovery"
            title="Video ideas from this week's trends"
            blurb="Turn what's rising right now into specific video ideas you could publish this week."
            actionLabel="Get ideas"
            context={{ topic: watch.query, risingPhrases: r.phrases.map((p) => p.phrase), topVideos: r.videos.slice(0, 10).map((v) => ({ title: v.title, viewsPerHour: v.viewsPerHour, channelSubs: v.channelSubs })) }}
          />
        </>
      )}
    </li>
  );
}

/** Trend radar: watched topics scanned daily for fast-rising videos and phrases. */
export function TrendRadar() {
  const [watches, setWatches] = useState<TrendWatch[] | null>(null);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");
  const [email, setEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [videoId, setVideoId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const o = await growth.watches();
      if (o.ok) setWatches(o.data);
      else setError(o.message);
    })();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setBusy(true);
    setError("");
    const o = await growth.addWatch(query.trim(), region, email);
    if (!o.ok) {
      setBusy(false);
      return setError(o.message);
    }
    setQuery("");
    const scanned = await growth.scanWatch(o.data.id);
    setBusy(false);
    const w = scanned.ok ? { ...o.data, last_results: scanned.data, last_run_at: scanned.data.ranAt } : o.data;
    setWatches((ws) => [...(ws ?? []), w]);
    if (!scanned.ok) setError(scanned.message);
  }

  return (
    <div className="space-y-5">
      <form onSubmit={(e) => void add(e)} className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-[1fr_180px_auto]">
        <Input label="Watch a topic" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. AI tools, budget travel, fitness for beginners" />
        <Select label="Region" value={region} onChange={(e) => setRegion(e.target.value)}>
          {REGIONS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
        </Select>
        <div className="flex items-end">
          <Button type="submit" loading={busy}><Plus className="size-4" aria-hidden="true" /> Watch</Button>
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-3">
          <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> Email me a morning digest for this topic
        </label>
      </form>
      <p className="text-xs text-muted-text">Each scan pulls the most-viewed uploads of the last 7 days and ranks them by views per hour since upload. Watched topics are re-scanned every morning (up to 5 topics, ~102 YouTube units each).</p>
      {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {watches === null ? (
        <p className="text-sm text-muted-text">Loading…</p>
      ) : watches.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-text">Add a topic to see what&apos;s rising on YouTube this week.</p>
      ) : (
        <ul className="space-y-4">
          {watches.map((w) => (
            <WatchCard
              key={w.id}
              watch={w}
              onOpen={setVideoId}
              onChange={(nw) => setWatches((ws) => (ws ?? []).map((x) => (x.id === nw.id ? nw : x)))}
              onRemove={() => void growth.removeWatch(w.id).then((o) => (o.ok ? setWatches((ws) => (ws ?? []).filter((x) => x.id !== w.id)) : setError(o.message)))}
            />
          ))}
        </ul>
      )}
      {videoId && <VideoDetailsPanel videoId={videoId} onClose={() => setVideoId(null)} />}
    </div>
  );
}
