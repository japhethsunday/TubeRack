"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, RefreshCw, Bookmark, BookmarkCheck, ChevronDown, ExternalLink, Rocket, GitCompare, X, Info, Loader2 } from "lucide-react";
import { api, ApiError } from "@/src/lib/api";
import type { CatalogNiche, NicheProfile, PlatformFocus } from "@/src/lib/market/signals";
import { REGIONS, regionName } from "@/src/lib/market/regions";
import { Button } from "@/src/components/ui/Button";
import { Select } from "@/src/components/ui/fields";
import { Modal } from "@/src/components/ui/overlays";
import { cx } from "@/src/components/ui/cx";
import { useIntel } from "@/src/components/intelligence/IntelProvider";

interface Leaderboard {
  region: string;
  focus: PlatformFocus;
  niches: NicheProfile[];
  pending: CatalogNiche[];
  methodology: string[];
}
interface Saved {
  id: string;
  name: string;
  query: string;
  region: string;
  category: string;
  snapshot: { overall?: number; earning?: number };
  created_at: string;
}

type SortKey = "overall" | "earning" | "competition" | "demand" | "growth";
const SORTS: { id: SortKey; label: string }[] = [
  { id: "overall", label: "Overall opportunity" },
  { id: "earning", label: "Earning potential" },
  { id: "demand", label: "Audience demand" },
  { id: "growth", label: "Growth" },
  { id: "competition", label: "Lowest competition" },
];
const QUOTA_PER_SCAN = 103;
const nf = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const pct = (x: number) => `${Math.round(x * 100)}%`;

function Score({ value, invert = false, label }: { value: number; invert?: boolean; label: string }) {
  const good = invert ? 100 - value : value;
  const tone = good >= 65 ? "bg-emerald-500" : good >= 40 ? "bg-amber-500" : "bg-rose-500";
  return (
    <span className="flex items-center gap-2" title={`${label}: ${value}/100`}>
      <span className="w-7 text-right text-sm font-semibold tabular-nums">{value}</span>
      <span className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-muted sm:block" aria-hidden="true">
        <span className={cx("block h-full rounded-full", tone)} style={{ width: `${value}%` }} />
      </span>
    </span>
  );
}

function channelHref(n: Pick<NicheProfile, "name" | "query" | "region"> & { category: { id: string } }) {
  const q = new URLSearchParams({ niche: n.name, query: n.query, region: n.region, category: n.category.id });
  return `/channel-creator?${q}`;
}

export function PayingNiches() {
  const [region, setRegion] = useState("US");
  const [focus, setFocus] = useState<PlatformFocus>("youtube");
  const [sort, setSort] = useState<SortKey>("overall");
  const [query, setQuery] = useState("");
  const [board, setBoard] = useState<Leaderboard | null>(null);
  // Niches the user analysed themselves are saved to the account.
  const intel = useIntel();
  const [freshCustom, setFreshCustom] = useState<NicheProfile[] | null>(null);
  const custom = useMemo<NicheProfile[]>(() => {
    if (freshCustom) return freshCustom;
    try {
      return JSON.parse(intel.outputFor("_workspace", "paying-niches-custom")?.text ?? "[]") as NicheProfile[];
    } catch {
      return [];
    }
  }, [freshCustom, intel]);
  const setCustom = (update: (c: NicheProfile[]) => NicheProfile[]) => {
    const next = update(custom).slice(0, 30);
    setFreshCustom(next);
    intel.saveOutputFor("_workspace", "paying-niches-custom", JSON.stringify(next), "Custom niche analyses");
  };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState<{ done: number; total: number } | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [tab, setTab] = useState<"ranking" | "saved">("ranking");

  const load = useCallback(async () => {
    try {
      const data = await api.get<Leaderboard>(`/api/v1/market/niches?region=${region}&focus=${focus}`);
      setBoard(data);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load niches.");
    } finally {
      setLoading(false);
    }
  }, [region, focus]);

  useEffect(() => {
    let alive = true;
    api
      .get<Leaderboard>(`/api/v1/market/niches?region=${region}&focus=${focus}`)
      .then((data) => {
        if (!alive) return;
        setBoard(data);
        setError(null);
      })
      .catch((e: unknown) => alive && setError(e instanceof ApiError ? e.message : "Could not load niches."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [region, focus]);

  useEffect(() => {
    api.get<Saved[]>("/api/v1/market/saved").then(setSaved).catch(() => setSaved([]));
  }, []);

  async function scan(items: { name: string; query: string; category?: string }[], refresh = false): Promise<NicheProfile[]> {
    const out: NicheProfile[] = [];
    setScanError(null);
    setScanning({ done: 0, total: items.length });
    try {
      for (let i = 0; i < items.length; i += 6) {
        const batch = items.slice(i, i + 6);
        const res = await api.post<{ niches: NicheProfile[]; failures: string[] }>("/api/v1/market/scan", { items: batch, region, focus, refresh });
        out.push(...res.niches);
        if (res.failures.length) setScanError(res.failures.join(" · "));
        setScanning({ done: Math.min(items.length, i + batch.length), total: items.length });
      }
    } catch (e) {
      setScanError(e instanceof ApiError ? e.message : "Scan failed.");
    } finally {
      setScanning(null);
    }
    return out;
  }

  async function scanPending() {
    if (!board?.pending.length) return;
    await scan(board.pending);
    await load();
  }

  async function analyseCustom() {
    const q = query.trim();
    if (q.length < 2) return;
    const [p] = await scan([{ name: q.replace(/\b\w/g, (c) => c.toUpperCase()), query: q }]);
    if (p) {
      setCustom((c) => [p, ...c.filter((x) => x.query !== p.query)]);
      setOpen(p.query);
    }
  }

  async function refreshOne(n: NicheProfile) {
    const [p] = await scan([{ name: n.name, query: n.query, category: n.category.id }], true);
    if (!p) return;
    setCustom((c) => c.map((x) => (x.query === p.query ? p : x)));
    await load();
  }

  async function toggleSave(n: NicheProfile) {
    const existing = saved.find((s) => s.query === n.query.toLowerCase() && s.region === n.region);
    try {
      if (existing) {
        await api.remove(`/api/v1/market/saved?id=${encodeURIComponent(existing.id)}`);
        setSaved((s) => s.filter((x) => x.id !== existing.id));
      } else {
        const row = await api.post<Saved>("/api/v1/market/saved", {
          name: n.name,
          query: n.query,
          region: n.region,
          category: n.category.id,
          snapshot: { ...n.scores, scannedAt: n.scannedAt },
        });
        setSaved((s) => [row, ...s]);
      }
    } catch (e) {
      setScanError(e instanceof ApiError ? e.message : "Could not update saved niches.");
    }
  }

  const all = useMemo(() => {
    const byQuery = new Map<string, NicheProfile>();
    for (const n of [...(board?.niches ?? []), ...custom.filter((c) => c.region === region)]) byQuery.set(n.query, n);
    return [...byQuery.values()];
  }, [board, custom, region]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? all.filter((n) => `${n.name} ${n.query} ${n.category.label}`.toLowerCase().includes(q)) : all;
    const key = (n: NicheProfile) => (sort === "competition" ? -n.scores.competition : n.scores[sort]);
    return [...filtered].sort((a, b) => key(b) - key(a));
  }, [all, query, sort]);

  const compared = all.filter((n) => compare.includes(n.query));
  const isSaved = (n: NicheProfile) => saved.some((s) => s.query === n.query.toLowerCase() && s.region === n.region);
  const noMatch = query.trim().length >= 2 && rows.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border" role="tablist">
        {(["ranking", "saved"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx("-mb-px border-b-2 px-3 py-2 text-sm font-medium capitalize", tab === t ? "border-primary text-foreground" : "border-transparent text-muted-text hover:text-foreground")}>
            {t === "saved" ? `Saved (${saved.length})` : "Ranking"}
          </button>
        ))}
      </div>

      {tab === "saved" ? (
        saved.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-text">Save niches from the ranking to shortlist them here.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {saved.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-muted-text">{regionName(s.region) || "Worldwide"} · saved {new Date(s.created_at).toLocaleDateString()}{typeof s.snapshot.overall === "number" ? ` · score ${s.snapshot.overall} at save` : ""}</p>
                </div>
                <Link href={channelHref({ name: s.name, query: s.query, region: s.region, category: { id: s.category } })} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90">
                  <Rocket className="size-3.5" aria-hidden="true" /> Build channel
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    await api.remove(`/api/v1/market/saved?id=${encodeURIComponent(s.id)}`).catch(() => undefined);
                    setSaved((x) => x.filter((y) => y.id !== s.id));
                  }}
                  className="rounded-md p-1.5 text-muted-text hover:bg-muted hover:text-foreground"
                  aria-label={`Remove ${s.name}`}
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_1fr_1fr_1fr]">
            <div className="space-y-1.5">
              <label htmlFor="niche-search" className="text-xs font-medium">Search or analyse a niche</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-text" aria-hidden="true" />
                <input
                  id="niche-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && noMatch && void analyseCustom()}
                  placeholder="e.g. dividend investing"
                  className="h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm"
                />
              </div>
            </div>
            <Select label="Country / audience" value={region} onChange={(e) => setRegion(e.target.value)}>
              {REGIONS.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
            </Select>
            <Select label="Platform" value={focus} onChange={(e) => setFocus(e.target.value as PlatformFocus)}>
              <option value="youtube">YouTube (all formats)</option>
              <option value="long">YouTube long-form</option>
              <option value="shorts">YouTube Shorts</option>
            </Select>
            <Select label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          </div>

          {board && board.pending.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
              <span className="text-muted-text">
                {board.niches.length} of {board.niches.length + board.pending.length} niches have fresh data for {regionName(region) || "Worldwide"}.
              </span>
              <Button size="sm" variant="outline" disabled={!!scanning} onClick={() => void scanPending()} title={`Uses about ${board.pending.length * QUOTA_PER_SCAN} YouTube API quota units`}>
                <RefreshCw className="size-3.5" aria-hidden="true" /> Scan {board.pending.length} remaining
              </Button>
            </div>
          )}
          {scanning && (
            <p className="flex items-center gap-2 text-sm text-muted-text" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Scanning live YouTube data… {scanning.done}/{scanning.total}
            </p>
          )}
          {scanError && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{scanError}</p>}
          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}

          {noMatch && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border p-4 text-sm">
              <span className="text-muted-text">“{query.trim()}” isn’t in the ranking yet.</span>
              <Button size="sm" disabled={!!scanning} onClick={() => void analyseCustom()}>
                <Search className="size-3.5" aria-hidden="true" /> Analyse with live data
              </Button>
            </div>
          )}

          {loading && !board ? (
            <div className="space-y-2" aria-busy="true">
              {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />)}
            </div>
          ) : rows.length === 0 && !noMatch ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <p className="font-medium">No niches scanned for {regionName(region) || "Worldwide"} yet</p>
              <p className="mt-1 text-sm text-muted-text">Each niche is measured from live YouTube data. Scan them to build the ranking.</p>
              {board && board.pending.length > 0 && (
                <Button className="mt-4" disabled={!!scanning} onClick={() => void scanPending()}>
                  <RefreshCw className="size-4" aria-hidden="true" /> Scan {board.pending.length} niches
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <div className="hidden grid-cols-[28px_minmax(0,2fr)_repeat(6,minmax(0,1fr))_120px] items-center gap-2 border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-text lg:grid">
                <span />
                <span>Niche</span>
                <span>Overall</span>
                <span>Earning</span>
                <span title="Industry advertiser tier — estimate">Advertiser*</span>
                <span>Demand</span>
                <span>Competition</span>
                <span>Growth</span>
                <span />
              </div>
              <ul>
                {rows.map((n, i) => {
                  const isOpen = open === n.query;
                  const m = n.measures;
                  return (
                    <li key={n.query} className="border-b border-border last:border-0">
                      <div className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 lg:grid-cols-[28px_minmax(0,2fr)_repeat(6,minmax(0,1fr))_120px]">
                        <input
                          type="checkbox"
                          checked={compare.includes(n.query)}
                          onChange={(e) => setCompare((c) => (e.target.checked ? [...c, n.query].slice(-4) : c.filter((x) => x !== n.query)))}
                          aria-label={`Compare ${n.name}`}
                          className="size-4 accent-[var(--primary)]"
                        />
                        <button type="button" onClick={() => setOpen(isOpen ? null : n.query)} aria-expanded={isOpen} className="min-w-0 text-left">
                          <span className="flex items-center gap-2">
                            <span className="w-5 shrink-0 text-xs tabular-nums text-muted-text">{i + 1}</span>
                            <span className="truncate font-medium">{n.name}</span>
                            <ChevronDown className={cx("size-4 shrink-0 text-muted-text transition-transform", isOpen && "rotate-180")} aria-hidden="true" />
                          </span>
                          <span className="ml-7 block truncate text-xs text-muted-text">{n.category.label}</span>
                        </button>
                        <span className="lg:hidden"><Score value={n.scores.overall} label="Overall" /></span>
                        <span className="hidden lg:block"><Score value={n.scores.overall} label="Overall" /></span>
                        <span className="hidden lg:block"><Score value={n.scores.earning} label="Earning potential" /></span>
                        <span className="hidden text-sm lg:block" title={n.category.why}>Tier {n.category.tier}/5</span>
                        <span className="hidden lg:block"><Score value={n.scores.demand} label="Demand" /></span>
                        <span className="hidden lg:block"><Score value={n.scores.competition} invert label="Competition" /></span>
                        <span className="hidden lg:block"><Score value={n.scores.growth} label="Growth" /></span>
                        <span className="hidden items-center justify-end gap-1 lg:flex">
                          <button type="button" onClick={() => void toggleSave(n)} aria-label={isSaved(n) ? `Unsave ${n.name}` : `Save ${n.name}`} className="rounded-md p-1.5 text-muted-text hover:bg-muted hover:text-foreground">
                            {isSaved(n) ? <BookmarkCheck className="size-4 text-primary" aria-hidden="true" /> : <Bookmark className="size-4" aria-hidden="true" />}
                          </button>
                          <Link href={channelHref(n)} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-primary hover:bg-primary/10">
                            <Rocket className="size-3.5" aria-hidden="true" /> Build
                          </Link>
                        </span>
                      </div>
                      {isOpen && (
                        <div className="grid gap-4 border-t border-border bg-background/40 p-4 lg:grid-cols-3">
                          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                            {([
                              ["Earning potential", n.scores.earning],
                              ["Advertiser tier (est.)", `${n.category.tier}/5`],
                              ["Audience demand", `${n.scores.demand} · ${nf.format(m.metrics.medianViewsPerDay)} views/day`],
                              ["Competition", n.scores.competition],
                              ["Content difficulty", n.scores.difficulty],
                              ["Growth", `${n.scores.growth} · ${pct(m.recentShare)} recent`],
                              ["YouTube suitability", n.scores.youtube],
                              ["Long-form", m.longCount ? `${n.scores.longForm} · ${nf.format(m.longViewsPerDay ?? 0)}/day` : "No long videos in top"],
                              ["Short-form", m.shortsCount ? `${n.scores.shortForm} · ${nf.format(m.shortsViewsPerDay ?? 0)}/day` : "No Shorts in top"],
                              ["Sponsorships", `${n.scores.sponsorship} · ${pct(m.sponsoredShare)} of top videos`],
                              ["Affiliate", `${n.scores.affiliate} · ${pct(m.affiliateShare)}`],
                              ["Digital products", `${n.scores.digital} · ${pct(m.digitalShare)}`],
                            ] as const).map(([k, v]) => (
                              <div key={k}>
                                <dt className="text-xs text-muted-text">{k}</dt>
                                <dd className="font-medium tabular-nums">{v}</dd>
                              </div>
                            ))}
                          </dl>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-text">Why it ranks here</p>
                            <ul className="mt-2 space-y-1.5 text-sm">
                              {n.reasons.map((r) => <li key={r} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-muted-text" aria-hidden="true" />{r}</li>)}
                            </ul>
                            <p className="mt-3 text-xs text-muted-text">
                              Sample: {m.metrics.sampleSize} top videos, {m.metrics.uniqueChannels} channels · {regionName(n.region) || "Worldwide"} · scanned {new Date(n.scannedAt).toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-text">Angles already working</p>
                            <ul className="mt-2 space-y-2">
                              {n.angles.map((a) => (
                                <li key={a.videoId} className="text-sm">
                                  <a href={`https://www.youtube.com/watch?v=${a.videoId}`} target="_blank" rel="noreferrer" className="group inline-flex items-start gap-1 font-medium hover:text-primary">
                                    <span className="line-clamp-2">{a.title}</span>
                                    <ExternalLink className="mt-0.5 size-3 shrink-0 opacity-50 group-hover:opacity-100" aria-hidden="true" />
                                  </a>
                                  <span className="block text-xs text-muted-text">
                                    {a.channelTitle}{a.channelSubs !== null ? ` · ${nf.format(a.channelSubs)} subs` : ""} · {nf.format(a.viewsPerDay)} views/day
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="flex flex-wrap gap-2 lg:col-span-3">
                            <Link href={channelHref(n)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90">
                              <Rocket className="size-4" aria-hidden="true" /> Build a channel in this niche
                            </Link>
                            <Link href={`/intelligence/niche?seed=${encodeURIComponent(n.query)}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted">
                              <Search className="size-4" aria-hidden="true" /> Find sub-niches
                            </Link>
                            <Button variant="outline" size="sm" className="h-9" onClick={() => void toggleSave(n)}>
                              {isSaved(n) ? <BookmarkCheck className="size-4" aria-hidden="true" /> : <Bookmark className="size-4" aria-hidden="true" />}
                              {isSaved(n) ? "Saved" : "Save"}
                            </Button>
                            <Button variant="ghost" size="sm" className="h-9" disabled={!!scanning} onClick={() => void refreshOne(n)} title={`Re-scan now (~${QUOTA_PER_SCAN} quota units)`}>
                              <RefreshCw className="size-4" aria-hidden="true" /> Refresh data
                            </Button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <details className="rounded-xl border border-border bg-surface p-4 text-sm">
            <summary className="flex cursor-pointer items-center gap-2 font-medium">
              <Info className="size-4 text-muted-text" aria-hidden="true" /> Data and methodology
            </summary>
            <ul className="mt-3 space-y-2 text-muted-text">
              {(board?.methodology ?? []).map((m) => <li key={m}>{m}</li>)}
            </ul>
          </details>
        </>
      )}

      {compare.length >= 2 && tab === "ranking" && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full border border-border bg-elevated px-4 py-2 shadow-xl">
            <span className="text-sm">{compare.length} selected</span>
            <Button size="sm" onClick={() => setShowCompare(true)}>
              <GitCompare className="size-4" aria-hidden="true" /> Compare
            </Button>
            <button type="button" onClick={() => setCompare([])} className="text-xs text-muted-text hover:text-foreground">Clear</button>
          </div>
        </div>
      )}

      {showCompare && (
        <Modal title="Compare niches" description={`${regionName(region) || "Worldwide"} · live YouTube data`} onClose={() => setShowCompare(false)}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-text">
                  <th className="py-2 pr-3 font-medium">Metric</th>
                  {compared.map((n) => <th key={n.query} className="py-2 pr-3 font-semibold text-foreground">{n.name}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {([
                  ["Overall", (n: NicheProfile) => n.scores.overall],
                  ["Earning potential", (n: NicheProfile) => n.scores.earning],
                  ["Advertiser tier (est.)", (n: NicheProfile) => `${n.category.tier}/5`],
                  ["Demand (views/day)", (n: NicheProfile) => nf.format(n.measures.metrics.medianViewsPerDay)],
                  ["Competition", (n: NicheProfile) => n.scores.competition],
                  ["Growth", (n: NicheProfile) => n.scores.growth],
                  ["Difficulty", (n: NicheProfile) => n.scores.difficulty],
                  ["Sponsored videos", (n: NicheProfile) => pct(n.measures.sponsoredShare)],
                  ["Affiliate links", (n: NicheProfile) => pct(n.measures.affiliateShare)],
                  ["Own products", (n: NicheProfile) => pct(n.measures.digitalShare)],
                  ["Long-form", (n: NicheProfile) => n.scores.longForm],
                  ["Shorts", (n: NicheProfile) => n.scores.shortForm],
                ] as const).map(([label, get]) => (
                  <tr key={label}>
                    <td className="py-2 pr-3 text-muted-text">{label}</td>
                    {compared.map((n) => <td key={n.query} className="py-2 pr-3 font-medium tabular-nums">{get(n)}</td>)}
                  </tr>
                ))}
                <tr>
                  <td />
                  {compared.map((n) => (
                    <td key={n.query} className="py-3 pr-3">
                      <Link href={channelHref(n)} className="text-xs font-medium text-primary hover:underline">Build channel →</Link>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  );
}
