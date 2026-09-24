"use client";

import { useIntel } from "@/src/components/intelligence/IntelProvider";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Radar, Sparkles, Star, ChevronDown, Search, Lightbulb, Eye, Users, TrendingUp, Trophy } from "lucide-react";
import { scanNiches, nicheReport, type NicheResult, type NicheScan } from "@/src/lib/ai-client";
import type { NicheReport } from "@/src/lib/niche/score";
import { Input, Select } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";
import { DownloadButton } from "@/src/components/ui/DownloadButton";
import { downloadText, safeFileName } from "@/src/lib/download";
import { VideoDetailsPanel } from "@/src/components/intelligence/VideoDetailsPanel";
import { cx } from "@/src/components/ui/cx";
import { renderInline } from "@/src/components/ui/Markdown";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const SHORTLIST_KEY = "tuberack.niche.shortlist";

const REGIONS = [
  ["", "Worldwide"], ["US", "United States"], ["GB", "United Kingdom"], ["CA", "Canada"], ["AU", "Australia"],
  ["IN", "India"], ["NG", "Nigeria"], ["ZA", "South Africa"], ["KE", "Kenya"], ["GH", "Ghana"],
  ["DE", "Germany"], ["FR", "France"], ["BR", "Brazil"], ["PH", "Philippines"],
] as const;

const VERDICT_TONE = { "Strong opportunity": "ok", Promising: "info", Crowded: "warn", "Low demand": "bad" } as const;

function parseJsonOr<T>(text: string | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function loadShortlist(): NicheResult[] {
  try {
    const raw = localStorage.getItem(SHORTLIST_KEY);
    return raw ? (JSON.parse(raw) as NicheResult[]) : [];
  } catch {
    return [];
  }
}

function saveShortlist(list: NicheResult[]) {
  try {
    localStorage.setItem(SHORTLIST_KEY, JSON.stringify(list.slice(0, 20)));
  } catch {
    // storage unavailable — shortlist stays for this visit only
  }
}

function toCsv(niches: NicheResult[]): string {
  const head = ["Niche", "Search phrase", "Overall", "Verdict", "Demand", "Competition", "Opportunity", "Median views", "Median views/day", "Median channel subs", "Small-channel winners", "Sample", "Shorts share", "Angle"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = niches.map((n) =>
    [n.name, n.query, n.scores.overall, n.scores.verdict, n.scores.demand, n.scores.competition, n.scores.opportunity, n.metrics.medianViews, n.metrics.medianViewsPerDay, n.metrics.medianChannelSubs ?? "", n.metrics.smallChannelWinners, n.metrics.sampleSize, `${Math.round(n.metrics.shortsShare * 100)}%`, n.angle].map(esc).join(","),
  );
  return [head.map(esc).join(","), ...rows].join("\n");
}

function reportMarkdown(n: NicheResult, r: NicheReport): string {
  const list = (xs: string[]) => xs.map((x) => `- ${x}`).join("\n");
  return [
    `# Niche plan: ${n.name}`,
    `Search phrase: "${n.query}" · Overall ${n.scores.overall}/100 (${n.scores.verdict})`,
    `Demand ${n.scores.demand} · Competition ${n.scores.competition} · Opportunity ${n.scores.opportunity}`,
    "", "## Verdict", r.summary, "", "## Audience", r.audience, "", "## Content pillars", list(r.pillars),
    "", "## Video ideas", r.videoIdeas.map((v, i) => `${i + 1}. **${v.title}** (${v.format})\n   Hook: ${v.hook}`).join("\n"),
    "", "## Monetization", list(r.monetization), "", "## Risks", list(r.risks), "", "## First week", list(r.firstWeekPlan),
  ].join("\n");
}

function ScoreBar({ label, value, invert, hint }: { label: string; value: number; invert?: boolean; hint: string }) {
  const good = invert ? 100 - value : value;
  const color = good >= 60 ? "bg-success" : good >= 35 ? "bg-warning" : "bg-destructive";
  return (
    <div title={hint}>
      <div className="flex justify-between text-[11px] text-muted-text">
        <span>{label}</span>
        <span className="tabular-nums font-medium text-foreground">{value}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cx("h-full rounded-full transition-[width] duration-700", color)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function ScoreRing({ value }: { value: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const color = value >= 60 ? "text-success" : value >= 40 ? "text-warning" : "text-destructive";
  return (
    <div className="relative size-14 shrink-0" aria-label={`Overall score ${value} out of 100`}>
      <svg viewBox="0 0 56 56" className="size-14 -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" strokeWidth="5" className="stroke-muted" />
        <circle cx="28" cy="28" r={r} fill="none" strokeWidth="5" strokeLinecap="round" className={cx("stroke-current transition-[stroke-dashoffset] duration-700", color)} strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Eye; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-2.5 py-2">
      <p className="flex items-center gap-1 text-[11px] text-muted-text">
        <Icon className="size-3" aria-hidden="true" /> {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function NicheCard({
  niche,
  rank,
  starred,
  onStar,
  onOpenVideo,
}: {
  niche: NicheResult;
  rank: number;
  starred: boolean;
  onStar: () => void;
  onOpenVideo: (id: string) => void;
}) {
  const [open, setOpen] = useState(rank === 1);
  const intel = useIntel();
  const reportKey = `niche-report-${niche.query.toLowerCase()}`;
  const [freshReport, setReport] = useState<NicheReport | null>(null);
  const report = freshReport ?? parseJsonOr<NicheReport | null>(intel.outputFor("_workspace", reportKey)?.text, null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const m = niche.metrics;

  async function deepDive() {
    setBusy(true);
    setError("");
    const outcome = await nicheReport(niche);
    setBusy(false);
    if (outcome.ok) {
      setReport(outcome.data.report);
      intel.saveOutputFor("_workspace", reportKey, JSON.stringify(outcome.data.report), `Niche plan: ${niche.query}`);
    }
    else setError(outcome.message);
  }

  return (
    <li className="ui-lift rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <ScoreRing value={niche.scores.overall} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-text">#{rank}</span>
            <h3 className="font-semibold">{niche.name}</h3>
            <Badge tone={VERDICT_TONE[niche.scores.verdict]}>{niche.scores.verdict}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-text">
            Search phrase: <span className="font-medium text-foreground">“{niche.query}”</span>
            {niche.audience && <> · {niche.audience}</>}
          </p>
          {niche.angle && <p className="mt-1 text-sm text-foreground/90">{niche.angle}</p>}
        </div>
        <button
          type="button"
          onClick={onStar}
          aria-pressed={starred}
          aria-label={starred ? `Remove ${niche.name} from shortlist` : `Shortlist ${niche.name}`}
          className="rounded-md p-1.5 text-muted-text transition-colors hover:bg-muted hover:text-foreground"
        >
          <Star className={cx("size-4", starred && "fill-warning text-warning")} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <ScoreBar label="Demand" value={niche.scores.demand} hint="Median views per day of the top videos in the window (log scale)." />
        <ScoreBar label="Competition" value={niche.scores.competition} invert hint="Median channel size of the winners plus the share from 1M+ subscriber channels. Lower is easier." />
        <ScoreBar label="Opportunity" value={niche.scores.opportunity} hint="How often channels under 100k subscribers out-view their own subscriber count here." />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric icon={Eye} label="Median views" value={compact.format(m.medianViews)} />
        <Metric icon={TrendingUp} label="Median views/day" value={compact.format(m.medianViewsPerDay)} />
        <Metric icon={Users} label="Median channel subs" value={m.medianChannelSubs === null ? "—" : compact.format(m.medianChannelSubs)} />
        <Metric icon={Trophy} label="Small-channel wins" value={`${m.smallChannelWinners} of ${m.sampleSize}`} />
      </div>
      <p className="mt-2 text-[11px] text-muted-text">
        {m.uniqueChannels} channels in the sample · {Math.round(m.shortsShare * 100)}% Shorts · {Math.round(m.bigChannelShare * 100)}% from 1M+ channels
        {m.totalResults !== null && <> · ~{compact.format(m.totalResults)} matching videos</>}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" loading={busy} onClick={() => void deepDive()}>
          <Sparkles className="size-3.5" aria-hidden="true" /> {report ? "Rewrite plan" : "Deep dive"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <ChevronDown className={cx("size-3.5 transition-transform", open && "rotate-180")} aria-hidden="true" /> Top videos
        </Button>
        <Link href={`/intelligence/lab?idea=${encodeURIComponent(`${niche.name}: ${niche.angle || niche.query}`)}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium transition-colors hover:bg-muted">
          <Lightbulb className="size-3.5" aria-hidden="true" /> Idea Lab
        </Link>
      </div>

      {error && <p role="alert" className="mt-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      {open && (
        <ul className="ui-panel mt-3 space-y-2" aria-label={`Top videos for ${niche.name}`}>
          {niche.topVideos.map((v) => (
            <li key={v.videoId}>
              <button type="button" onClick={() => onOpenVideo(v.videoId)} className="flex w-full items-center gap-3 rounded-lg p-1.5 text-left transition-colors hover:bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnail. */}
                <img src={v.thumbnail} alt="" className="aspect-video w-28 shrink-0 rounded-md object-cover" loading="lazy" />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm font-medium">{v.title}</span>
                  <span className="block text-xs text-muted-text">
                    {v.channelTitle}
                    {v.channelSubs !== null && <> · {compact.format(v.channelSubs)} subs</>} · {compact.format(v.views)} views · {new Date(v.publishedAt).toLocaleDateString()}
                  </span>
                </span>
                {v.channelSubs !== null && v.channelSubs < 100_000 && v.views >= Math.max(1000, v.channelSubs) && <Badge tone="ok">Outlier</Badge>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {report && (
        <div className="ui-panel mt-4 space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="size-4 text-primary" aria-hidden="true" /> Launch plan</h4>
            <DownloadButton onDownload={() => downloadText(reportMarkdown(niche, report), safeFileName(`niche-${niche.name}`, "md"), "text/markdown")} />
          </div>
          <p className="text-sm">{renderInline(report.summary, "sum")}</p>
          {report.audience && <p className="text-sm text-muted-text"><span className="font-medium text-foreground">Audience: </span>{renderInline(report.audience, "aud")}</p>}
          <div className="grid gap-4 md:grid-cols-2">
            <Section title="Content pillars" items={report.pillars} />
            <Section title="Monetization paths" items={report.monetization} />
            <Section title="Risks" items={report.risks} />
            <Section title="First week" items={report.firstWeekPlan} ordered />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-text">Video ideas</p>
            <ol className="mt-2 space-y-2">
              {report.videoIdeas.map((v, i) => (
                <li key={i} className="rounded-lg border border-border bg-surface p-2.5">
                  <p className="text-sm font-medium">{i + 1}. {v.title} {v.format && <Badge tone="neutral" className="ml-1">{v.format}</Badge>}</p>
                  {v.hook && <p className="mt-0.5 text-xs text-muted-text">Hook: “{v.hook}”</p>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </li>
  );
}

function Section({ title, items, ordered }: { title: string; items: string[]; ordered?: boolean }) {
  if (items.length === 0) return null;
  const List = ordered ? "ol" : "ul";
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-text">{title}</p>
      <List className={cx("mt-1.5 space-y-1 pl-4 text-sm", ordered ? "list-decimal" : "list-disc")}>
        {items.map((x, i) => <li key={i}>{renderInline(x, `s${i}`)}</li>)}
      </List>
    </div>
  );
}

/** Niche Finder: Gemini proposes sub-niches, live YouTube data scores them. */
export function NicheFinder() {
  // Pre-filled from “Find sub-niches” links (?seed=).
  const [seed, setSeed] = useState(useSearchParams().get("seed") ?? "");
  const [audience, setAudience] = useState("");
  const [region, setRegion] = useState("");
  const [days, setDays] = useState("180");
  const [count, setCount] = useState("6");
  const [mode, setMode] = useState<"expand" | "exact">("expand");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const intel = useIntel();
  const [freshScan, setScan] = useState<NicheScan | null>(null);
  const scan = freshScan ?? parseJsonOr<NicheScan | null>(intel.outputFor("_workspace", "niche-last-scan")?.text, null);
  const savedShortlist = intel.outputFor("_workspace", "niche-shortlist");
  const [localShortlist, setShortlist] = useState<NicheResult[]>([]);
  const shortlist = savedShortlist ? parseJsonOr<NicheResult[]>(savedShortlist.text, []) : localShortlist;
  const [videoId, setVideoId] = useState<string | null>(null);
  const [view, setView] = useState<"results" | "shortlist">("results");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate the saved shortlist after mount (localStorage is client-only).
    setShortlist(loadShortlist());
  }, []);

  function toggleStar(n: NicheResult) {
    const exists = shortlist.some((s) => s.query === n.query);
    const next = exists ? shortlist.filter((s) => s.query !== n.query) : [n, ...shortlist];
    setShortlist(next);
    saveShortlist(next);
    intel.saveOutputFor("_workspace", "niche-shortlist", JSON.stringify(next), "Niche shortlist");
  }

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    if (seed.trim().length < 2) {
      setError("Enter an interest, topic, or keyword (at least 2 characters).");
      return;
    }
    setBusy(true);
    setError("");
    const outcome = await scanNiches({ seed: seed.trim(), audience: audience.trim(), region, days: Number(days), count: mode === "exact" ? 1 : Number(count), mode });
    setBusy(false);
    if (outcome.ok) {
      setScan(outcome.data);
      intel.saveOutputFor("_workspace", "niche-last-scan", JSON.stringify(outcome.data), `Niche scan: ${seed.trim()}`);
      setView("results");
    } else setError(outcome.message);
  }

  const list = view === "shortlist" ? shortlist : scan?.niches ?? [];

  return (
    <div className="space-y-5">
      <form onSubmit={(e) => void run(e)} className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm" role="radiogroup" aria-label="Scan mode">
          {([["expand", "Find sub-niches"], ["exact", "Score one exact niche"]] as const).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={mode === id} onClick={() => setMode(id)} className={cx("flex-1 rounded-md px-3 py-1.5 font-medium transition-colors", mode === id ? "bg-surface shadow-sm" : "text-muted-text hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label={mode === "expand" ? "Interest, topic, or keyword" : "Niche search phrase"} value={seed} onChange={(e) => setSeed(e.target.value)} placeholder={mode === "expand" ? "e.g. personal finance, home workouts, AI tools" : "e.g. budget meal prep for students"} />
          <Input label="Target audience (optional)" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. beginners in their 20s" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="Region" value={region} onChange={(e) => setRegion(e.target.value)}>
            {REGIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </Select>
          <Select label="Time window" value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="90">Last 3 months</option>
            <option value="180">Last 6 months</option>
            <option value="365">Last 12 months</option>
          </Select>
          {mode === "expand" && (
            <Select label="Niches to test" value={count} onChange={(e) => setCount(e.target.value)} hint="Each niche uses ~102 YouTube API units.">
              <option value="4">4 niches</option>
              <option value="6">6 niches</option>
              <option value="8">8 niches</option>
            </Select>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={busy}>
            {mode === "expand" ? <Radar className="size-4" aria-hidden="true" /> : <Search className="size-4" aria-hidden="true" />}
            {busy ? "Scanning YouTube…" : mode === "expand" ? "Find niches" : "Score niche"}
          </Button>
          <p className="text-xs text-muted-text">Scores come from the most-viewed videos in the window: real views, upload dates, and channel sizes.</p>
        </div>
        {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      </form>

      {(scan || shortlist.length > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
            <button type="button" disabled={!scan} onClick={() => setView("results")} className={cx("rounded-md px-3 py-1.5 font-medium transition-colors disabled:opacity-50", view === "results" ? "bg-surface shadow-sm" : "text-muted-text hover:text-foreground")}>
              Results {scan ? `(${scan.niches.length})` : ""}
            </button>
            <button type="button" onClick={() => setView("shortlist")} className={cx("rounded-md px-3 py-1.5 font-medium transition-colors", view === "shortlist" ? "bg-surface shadow-sm" : "text-muted-text hover:text-foreground")}>
              Shortlist ({shortlist.length})
            </button>
          </div>
          {list.length > 0 && <DownloadButton label="Download CSV" onDownload={() => downloadText(toCsv(list), safeFileName(`niches-${view === "shortlist" ? "shortlist" : scan?.seed ?? "scan"}`, "csv"), "text/csv")} />}
        </div>
      )}

      {view === "results" && scan && scan.failures.length > 0 && (
        <p className="rounded-lg bg-warning/10 p-3 text-xs text-warning">Some niches could not be scanned: {scan.failures.join(" · ")}</p>
      )}

      {view === "shortlist" && shortlist.length > 1 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <caption className="sr-only">Shortlist comparison</caption>
            <thead className="text-left text-xs text-muted-text">
              <tr>{["Niche", "Overall", "Demand", "Competition", "Opportunity", "Views/day", "Small wins"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {[...shortlist].sort((a, b) => b.scores.overall - a.scores.overall).map((n) => (
                <tr key={n.query} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{n.name}</td>
                  <td className="px-3 py-2 tabular-nums">{n.scores.overall}</td>
                  <td className="px-3 py-2 tabular-nums">{n.scores.demand}</td>
                  <td className="px-3 py-2 tabular-nums">{n.scores.competition}</td>
                  <td className="px-3 py-2 tabular-nums">{n.scores.opportunity}</td>
                  <td className="px-3 py-2 tabular-nums">{compact.format(n.metrics.medianViewsPerDay)}</td>
                  <td className="px-3 py-2 tabular-nums">{n.metrics.smallChannelWinners}/{n.metrics.sampleSize}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {list.length > 0 ? (
        <ol className="space-y-3" aria-label={view === "shortlist" ? "Shortlisted niches" : "Ranked niches"}>
          {list.map((n, i) => (
            <NicheCard key={`${view}-${n.query}`} niche={n} rank={i + 1} starred={shortlist.some((s) => s.query === n.query)} onStar={() => toggleStar(n)} onOpenVideo={setVideoId} />
          ))}
        </ol>
      ) : view === "shortlist" ? (
        <p className="text-sm text-muted-text">Star niches in your results to compare them here.</p>
      ) : null}

      <details className="rounded-xl border border-border bg-surface p-4 text-sm">
        <summary className="cursor-pointer font-medium">How the scores work</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-text">
          <li><b className="text-foreground">Demand</b>: median views per day of the most-viewed videos uploaded in your window (log scale: 10/day = 0, 100k/day = 100).</li>
          <li><b className="text-foreground">Competition</b>: median subscriber count of the channels winning those slots, plus how many are 1M+ channels. Lower is easier to break into.</li>
          <li><b className="text-foreground">Opportunity</b>: how often channels under 100k subscribers get more views than they have subscribers — proof small creators can win.</li>
          <li><b className="text-foreground">Overall</b> = 40% demand + 35% opportunity + 25% (100 − competition). Nothing is estimated; every input comes from the YouTube Data API.</li>
        </ul>
      </details>

      {videoId && <VideoDetailsPanel videoId={videoId} onClose={() => setVideoId(null)} />}
    </div>
  );
}
