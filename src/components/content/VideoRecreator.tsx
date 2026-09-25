"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clapperboard, Copy, Flame, History, Link2, Loader2, Plus, Search, Sparkles, Trash2, Wand2 } from "lucide-react";
import { api, ApiError } from "@/src/lib/api";
import { retryBusy } from "@/src/lib/ai-client";
import { useProjects } from "@/src/components/projects/ProjectsProvider";
import { useIntel } from "@/src/components/intelligence/IntelProvider";
import { useScripts } from "@/src/components/script/ScriptProvider";
import { usePackaging } from "@/src/components/package/PackagingProvider";
import { emptyAudienceProfile, emptyStrategyBrief } from "@/src/lib/intelligence/profiles";
import { blankSection } from "@/src/lib/script/claims";
import type { SectionType } from "@/src/lib/script/types";
import { Button } from "@/src/components/ui/Button";
import { Input, Select } from "@/src/components/ui/fields";
import { Alert } from "@/src/components/ui/Alert";
import { cx } from "@/src/components/ui/cx";
import type { Outlier, OutlierScan, Recreation } from "@/src/server/content/recreate";

const HISTORY_KEY = "video-recreator-history";
const MAX_HISTORY = 10;
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const mmss = (s: number | null) => (s === null ? "—" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
const ago = (iso: string) => {
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d < 1 ? "today" : d < 30 ? `${d}d ago` : d < 365 ? `${Math.round(d / 30)}mo ago` : `${Math.round(d / 365)}y ago`;
};

function OutlierCard({ v, busy, onPick }: { v: Outlier; busy: boolean; onPick: () => void }) {
  const hot = (v.multiplier ?? 0) >= 3 || v.lift >= 3;
  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <a href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer" className="relative block">
        {v.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail.
          <img src={v.thumbnail} alt="" loading="lazy" decoding="async" className="aspect-video w-full object-cover" />
        ) : (
          <div className="aspect-video w-full bg-muted" />
        )}
        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold text-white">{mmss(v.durationSec)}</span>
        {v.multiplier !== null && (
          <span className={cx("absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold", hot ? "bg-destructive text-white" : "bg-black/75 text-white")}>
            {hot && <Flame className="size-3" aria-hidden="true" />}
            {v.multiplier}× subs
          </span>
        )}
      </a>
      <div className="flex flex-1 flex-col p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{v.title}</h3>
        <p className="mt-1 truncate text-xs text-muted-text">
          {v.channel}
          {v.subscribers !== null ? ` · ${compact.format(v.subscribers)} subs` : ""}
        </p>
        <p className="mt-0.5 text-xs text-muted-text">
          {compact.format(v.views)} views · {compact.format(v.viewsPerDay)}/day · {ago(v.publishedAt)}
          {v.lift >= 1.5 && <span className="ml-1 font-semibold text-success">{v.lift}× niche pace</span>}
        </p>
        <div className="mt-auto pt-3">
          <Button size="sm" className="w-full" onClick={onPick} disabled={busy}>
            <Wand2 className="size-4" aria-hidden="true" /> Break down &amp; recreate
          </Button>
        </div>
      </div>
    </li>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-muted-text">{title}</p>
      <ul className="mt-1 space-y-1 text-sm">
        {items.map((x) => (
          <li key={x} className="flex gap-2">
            <span className="text-muted-text">•</span>
            <span>{x}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Type for each blueprint beat in the script: first is the hook, last is the call to action. */
function beatType(i: number, n: number, beat: string): SectionType {
  if (i === 0) return "hook";
  if (i === n - 1 && /cta|call|subscribe|outro|next/i.test(beat)) return "cta";
  if (i === n - 1) return "conclusion";
  if (/intro|setup|context/i.test(beat)) return "setup";
  if (/example|story|case|demo/i.test(beat)) return "example";
  return "main-point";
}

/**
 * Video Recreator: breakout videos in a niche (views far above channel size),
 * a precise breakdown of why one works, and an original blueprint that goes
 * straight into a project with a full script draft.
 */
export function VideoRecreator() {
  const router = useRouter();
  const projects = useProjects();
  const intel = useIntel();
  const scripts = useScripts();
  const pack = usePackaging();

  const [mode, setMode] = useState<"find" | "link">("find");
  const [niche, setNiche] = useState("");
  const [days, setDays] = useState("90");
  const [format, setFormat] = useState<"any" | "long" | "short">("any");
  const [link, setLink] = useState("");
  const [audience, setAudience] = useState("");
  const [channelId, setChannelId] = useState("");
  const [makeAs, setMakeAs] = useState<"auto" | "long" | "short">("auto");
  const [scan, setScan] = useState<OutlierScan | null>(null);
  const [scanning, setScanning] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Recreation | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [titleIdx, setTitleIdx] = useState(0);
  const [copied, setCopied] = useState(false);

  const history: Recreation[] = (() => {
    try {
      const raw = intel.outputFor("_workspace", HISTORY_KEY)?.text;
      return raw ? (JSON.parse(raw) as Recreation[]) : [];
    } catch {
      return [];
    }
  })();
  const result: Recreation | null = fresh ?? history.find((h) => h.createdAt === openId) ?? (showForm || scan ? null : history[0] ?? null);
  const saveHistory = (list: Recreation[]) => intel.saveOutputFor("_workspace", HISTORY_KEY, JSON.stringify(list.slice(0, MAX_HISTORY)), "Video recreations");
  const channel = projects.channels.find((c) => c.id === channelId) ?? null;

  async function findVideos(e: React.FormEvent) {
    e.preventDefault();
    if (niche.trim().length < 2) {
      setError("Enter your niche or a topic to search, e.g. “budget travel”.");
      return;
    }
    setScanning(true);
    setError(null);
    try {
      const data = await retryBusy(() => api.post<OutlierScan>("/api/v1/recreate/outliers", { query: niche, days: Number(days), format }));
      setScan(data);
      if (!data.videos.length) setError("No videos found for that search in this period. Try a broader topic or a longer period.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't search YouTube right now. Please try again.");
    } finally {
      setScanning(false);
    }
  }

  async function recreate(video: string) {
    setWorking(video);
    setError(null);
    try {
      const data = await retryBusy(() =>
        api.post<Recreation>("/api/v1/recreate", { video, niche: niche || channel?.niche || "", audience, channelName: channel?.name ?? "", format: makeAs }),
      );
      setFresh(data);
      setOpenId(data.createdAt);
      setShowForm(false);
      setTitleIdx(0);
      saveHistory([data, ...history.filter((h) => h.createdAt !== data.createdAt)]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't break down that video right now. Please try again.");
    } finally {
      setWorking(null);
    }
  }

  function createVideo(r: Recreation) {
    const bp = r.blueprint;
    const title = bp.titles[titleIdx] ?? bp.titles[0];
    const ch = channel ?? projects.channels[0] ?? projects.addChannel(r.niche || "My channel", r.niche);
    const existing = projects.projects.find((p) => p.channelId === ch.id && p.name.trim().toLowerCase() === title.trim().toLowerCase());
    if (existing) {
      router.push(`/studio/script?project=${existing.id}`);
      return;
    }
    const short = bp.format === "Short";
    const project = projects.create({
      name: title,
      contentType: short ? "Short" : "Long-form video",
      platform: short ? "YouTube Shorts" : "YouTube",
      channelId: ch.id,
      topic: title,
      description: [`Hook: ${bp.hook}`, `Angle: ${bp.angle}`, `Inspired by: “${r.source.title}” (${r.source.channel})`].join("\n"),
      goal: r.breakdown.promise.slice(0, 280),
    });
    const now = new Date().toISOString();
    intel.saveStrategyFor(project.id, {
      ...emptyStrategyBrief(now),
      topic: title,
      angle: bp.angle,
      promise: r.breakdown.promise,
      hook: bp.hook,
      takeaway: r.breakdown.audienceWants[0] ?? "",
      cta: bp.cta,
      differentiation: [...r.breakdown.weaknesses, ...bp.originality].join("\n"),
      points: bp.outline.map((o) => o.beat).join("\n"),
    });
    if (r.audience) intel.saveAudienceFor(project.id, { ...emptyAudienceProfile(now), primary: r.audience, intent: bp.keywords[0] ? `Searches “${bp.keywords[0]}”` : "" });
    intel.saveOutputFor(project.id, "content-idea", blueprintText(r, title), "Video blueprint");
    if (bp.thumbnail) intel.saveOutputFor(project.id, "thumbnail-concepts", `Concept from Video Recreator: ${bp.thumbnail}${bp.thumbnailText ? ` — text: “${bp.thumbnailText}”` : ""}`, "Thumbnail concepts");
    if (bp.keywords.length) {
      const seo = pack.seoFor(project.id);
      pack.saveSeo({ ...seo, topic: bp.keywords[0], keywords: [...new Set([...bp.keywords, ...seo.keywords])], audience: r.audience || seo.audience });
    }
    // A full script draft from the outline, ready to edit in Script Studio.
    const sections = bp.outline.map((o, i) => ({
      ...blankSection(beatType(i, bp.outline.length, o.beat), o.beat, now),
      text: o.say,
      aiGenerated: true,
      aiNote: "Drafted from the Video Recreator blueprint. Make it yours: your examples, your voice.",
      creatorNotes: o.show ? `Show: ${o.show}` : "",
    }));
    const words = sections.reduce((s, x) => s + x.text.split(/\s+/).filter(Boolean).length, 0);
    scripts.putScript({
      projectId: project.id,
      format: short ? "Short-form" : "YouTube long-form",
      tone: "Conversational",
      complexity: "Beginner",
      structure: "Standard",
      targetWords: Math.max(words, Math.round((bp.lengthSec / 60) * 150)),
      wpm: 150,
      instruction: [`Angle: ${bp.angle}`, ...bp.retention.map((x) => `Retention: ${x}`)].join("\n"),
      sections,
      versions: [],
      notes: blueprintText(r, title),
      updatedAt: now,
    });
    router.push(`/studio/script?project=${project.id}`);
  }

  function blueprintText(r: Recreation, title: string): string {
    const bp = r.blueprint;
    return [
      title,
      `Hook: ${bp.hook}`,
      `Angle: ${bp.angle}`,
      `Thumbnail: ${bp.thumbnail}${bp.thumbnailText ? ` (text: “${bp.thumbnailText}”)` : ""}`,
      "",
      ...bp.outline.map((o, i) => `${i + 1}. ${o.beat} (${o.seconds}s)\n   Say: ${o.say}\n   Show: ${o.show}`),
      "",
      `CTA: ${bp.cta}`,
      bp.keywords.length ? `Keywords: ${bp.keywords.join(", ")}` : "",
      `Inspired by: https://www.youtube.com/watch?v=${r.source.id}`,
    ]
      .filter((x) => x !== undefined)
      .join("\n");
  }

  const sidebar = (
    <aside className="space-y-2 lg:sticky lg:top-20 lg:self-start">
      <Button
        className="w-full"
        variant={result ? "outline" : "primary"}
        onClick={() => {
          setFresh(null);
          setOpenId(null);
          setShowForm(true);
        }}
      >
        <Plus className="size-4" aria-hidden="true" /> New recreation
      </Button>
      {history.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-2">
          <p className="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-muted-text">
            <History className="size-3.5" aria-hidden="true" /> Saved blueprints
          </p>
          <ul className="space-y-0.5">
            {history.map((h) => (
              <li key={h.createdAt} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setFresh(null);
                    setShowForm(false);
                    setOpenId(h.createdAt);
                    setTitleIdx(0);
                  }}
                  className={cx("min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left", result?.createdAt === h.createdAt ? "bg-muted font-medium" : "hover:bg-muted")}
                >
                  <span className="block truncate text-sm">{h.blueprint.titles[0]}</span>
                  <span className="block truncate text-[11px] text-muted-text">
                    from {h.source.channel} · {new Date(h.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Delete blueprint"
                  onClick={() => {
                    saveHistory(history.filter((x) => x.createdAt !== h.createdAt));
                    if (result?.createdAt === h.createdAt) {
                      setFresh(null);
                      setOpenId(null);
                    }
                  }}
                  className="rounded p-1 text-muted-text opacity-60 hover:bg-muted hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );

  const busyAny = scanning || working !== null;

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      {sidebar}
      <div className="min-w-0 space-y-6">
        {!result && (
          <>
            <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
              <div className="inline-flex rounded-lg border border-border p-0.5" role="tablist">
                {(
                  [
                    ["find", "Find breakout videos", Search],
                    ["link", "Paste a video link", Link2],
                  ] as const
                ).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={mode === id}
                    onClick={() => setMode(id)}
                    className={cx("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm", mode === id ? "bg-muted font-medium" : "text-muted-text hover:text-foreground")}
                  >
                    <Icon className="size-4" aria-hidden="true" /> {label}
                  </button>
                ))}
              </div>

              {mode === "find" ? (
                <form onSubmit={findVideos} className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                  <Input label="Niche or topic" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="e.g. budget travel" maxLength={120} />
                  <Select label="Published in the last" value={days} onChange={(e) => setDays(e.target.value)}>
                    <option value="7">7 days</option>
                    <option value="30">30 days</option>
                    <option value="90">3 months</option>
                    <option value="180">6 months</option>
                    <option value="365">12 months</option>
                  </Select>
                  <Select label="Format" value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
                    <option value="any">All videos</option>
                    <option value="long">Long-form</option>
                    <option value="short">Shorts</option>
                  </Select>
                  <Button type="submit" disabled={busyAny}>
                    {scanning ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Search className="size-4" aria-hidden="true" />}
                    {scanning ? "Searching…" : "Find videos"}
                  </Button>
                </form>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (link.trim()) void recreate(link.trim());
                  }}
                  className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
                >
                  <Input label="YouTube video link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" maxLength={300} />
                  <Button type="submit" disabled={busyAny || !link.trim()}>
                    {working ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Wand2 className="size-4" aria-hidden="true" />}
                    {working ? "Breaking it down…" : "Break down & recreate"}
                  </Button>
                </form>
              )}

              <details className="rounded-xl border border-border bg-background p-3 text-sm">
                <summary className="cursor-pointer font-medium">Make it fit your channel (optional)</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Select label="Your channel" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
                    <option value="">{projects.channels.length ? "Choose a channel" : "No channels yet"}</option>
                    {projects.channels.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  <Input label="Audience" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. students on a tight budget" maxLength={200} />
                  <Select label="Make it as" value={makeAs} onChange={(e) => setMakeAs(e.target.value as typeof makeAs)}>
                    <option value="auto">Same format as the original</option>
                    <option value="long">Long-form video</option>
                    <option value="short">Short</option>
                  </Select>
                </div>
              </details>
              {working && <p className="text-xs text-muted-text">Reading the video, its numbers and its comments, then writing your blueprint — about 20–40 seconds.</p>}
              {error && <Alert tone="bad" title="Video Recreator">{error}</Alert>}
            </div>

            {scan && scan.videos.length > 0 && mode === "find" && (
              <section aria-label="Breakout videos" className="space-y-3">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <Flame className="size-5 text-destructive" aria-hidden="true" /> Breakout videos in “{scan.query}”
                  </h2>
                  <p className="text-xs text-muted-text">
                    Ranked by views compared with channel size — small channels beating their size are the most repeatable wins. Niche pace: {compact.format(scan.medianViewsPerDay)} views/day.
                  </p>
                </div>
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {scan.videos.map((v) => (
                    <OutlierCard key={v.id} v={v} busy={busyAny} onPick={() => void recreate(v.id)} />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {result && (
          <>
            <section aria-label="Source video" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:flex-row">
              <a href={`https://www.youtube.com/watch?v=${result.source.id}`} target="_blank" rel="noreferrer" className="shrink-0 sm:w-64">
                {/* eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail. */}
                <img src={result.source.thumbnail} alt="" className="aspect-video w-full rounded-lg object-cover" />
              </a>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-muted-text">Original video</p>
                <h2 className="text-base font-semibold leading-snug">{result.source.title}</h2>
                <p className="mt-1 text-xs text-muted-text">
                  {result.source.channel}
                  {result.source.subscribers !== null ? ` · ${compact.format(result.source.subscribers)} subs` : ""} · {mmss(result.source.durationSec)} · {ago(result.source.publishedAt)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {result.source.views !== null && <span className="rounded-full bg-muted px-2 py-0.5">{compact.format(result.source.views)} views</span>}
                  {result.source.likes !== null && <span className="rounded-full bg-muted px-2 py-0.5">{compact.format(result.source.likes)} likes</span>}
                  {result.source.comments !== null && <span className="rounded-full bg-muted px-2 py-0.5">{compact.format(result.source.comments)} comments</span>}
                  {result.source.multiplier !== null && (
                    <span className="rounded-full bg-destructive/15 px-2 py-0.5 font-semibold text-destructive">{result.source.multiplier}× its subscriber count</span>
                  )}
                </div>
                <p className="mt-2 text-sm">{result.breakdown.summary}</p>
              </div>
            </section>

            <section aria-label="Why it works" className="space-y-4 rounded-2xl border border-border bg-surface p-4">
              <h2 className="text-lg font-semibold">Why it works</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Title", result.breakdown.packaging.title],
                  ["Thumbnail", result.breakdown.packaging.thumbnail],
                  ["Hook", result.breakdown.hook],
                  ["Promise", result.breakdown.promise],
                ].map(([l, t]) =>
                  t ? (
                    <div key={l} className="rounded-xl border border-border p-3">
                      <p className="text-xs font-semibold text-muted-text">{l}</p>
                      <p className="mt-1 text-sm">{t}</p>
                    </div>
                  ) : null,
                )}
              </div>
              {result.breakdown.structure.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-text">Structure</p>
                  <ol className="mt-1 space-y-1 text-sm">
                    {result.breakdown.structure.map((s, i) => (
                      <li key={`${s.beat}-${i}`}>
                        <span className="font-medium">
                          {i + 1}. {s.beat}
                        </span>
                        {s.purpose && <span className="text-muted-text"> — {s.purpose}</span>}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {result.breakdown.emotions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {result.breakdown.emotions.map((e) => (
                    <span key={e} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      {e}
                    </span>
                  ))}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-3">
                <List title="Viewers loved" items={result.breakdown.audienceLoved} />
                <List title="Viewers still want" items={result.breakdown.audienceWants} />
                <List title="Where you can beat it" items={result.breakdown.weaknesses} />
              </div>
            </section>

            <section aria-label="Your blueprint" className="space-y-4 rounded-2xl border-2 border-primary/40 bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Sparkles className="size-5 text-primary" aria-hidden="true" /> Your original version
                </h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
                  {result.blueprint.format} · {mmss(result.blueprint.lengthSec)}
                </span>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-text">Pick a title</p>
                <div className="mt-1 space-y-1.5">
                  {result.blueprint.titles.map((t, i) => (
                    <label key={t} className={cx("flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm", titleIdx === i ? "border-primary bg-primary/5 font-medium" : "border-border")}>
                      <input type="radio" name="bp-title" checked={titleIdx === i} onChange={() => setTitleIdx(i)} />
                      {t}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs font-semibold text-muted-text">Hook (first seconds)</p>
                  <p className="mt-1 text-sm">“{result.blueprint.hook}”</p>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs font-semibold text-muted-text">Your angle</p>
                  <p className="mt-1 text-sm">{result.blueprint.angle}</p>
                </div>
                <div className="rounded-xl border border-border p-3 sm:col-span-2">
                  <p className="text-xs font-semibold text-muted-text">Thumbnail</p>
                  <p className="mt-1 text-sm">
                    {result.blueprint.thumbnail}
                    {result.blueprint.thumbnailText && <span className="ml-1 font-semibold">Text: “{result.blueprint.thumbnailText}”</span>}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-text">Beat-by-beat plan</p>
                <ol className="mt-1 divide-y divide-border rounded-xl border border-border">
                  {result.blueprint.outline.map((o, i) => (
                    <li key={`${o.beat}-${i}`} className="grid gap-1 p-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
                      <div>
                        <p className="text-sm font-semibold">
                          {i + 1}. {o.beat}
                        </p>
                        <p className="text-xs text-muted-text">{o.seconds}s</p>
                      </div>
                      <div className="space-y-1 text-sm">
                        <p>{o.say}</p>
                        {o.show && <p className="text-xs text-muted-text">Show: {o.show}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <List title="Keep viewers watching" items={result.blueprint.retention} />
                <List title="How this stays original" items={result.blueprint.originality} />
              </div>
              {(result.blueprint.cta || result.blueprint.keywords.length > 0) && (
                <div className="grid gap-1 text-sm sm:grid-cols-2">
                  {result.blueprint.cta && (
                    <p>
                      <span className="font-medium">Call to action: </span>
                      <span className="text-muted-text">{result.blueprint.cta}</span>
                    </p>
                  )}
                  {result.blueprint.keywords.length > 0 && (
                    <p>
                      <span className="font-medium">Search phrases: </span>
                      <span className="text-muted-text">{result.blueprint.keywords.join(", ")}</span>
                    </p>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <Button onClick={() => createVideo(result)}>
                  <Clapperboard className="size-4" aria-hidden="true" /> Create this video
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    void navigator.clipboard?.writeText(blueprintText(result, result.blueprint.titles[titleIdx] ?? result.blueprint.titles[0])).then(() => {
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1500);
                    });
                  }}
                >
                  {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                  {copied ? "Copied" : "Copy blueprint"}
                </Button>
              </div>
              <p className="text-xs text-muted-text">
                Creates a project with the script drafted beat by beat, plus the strategy, SEO keywords and thumbnail concept filled in across every tool.
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
