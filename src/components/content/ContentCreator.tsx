"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Check, Clapperboard, Copy, Lightbulb, Loader2, Sparkles, TrendingUp, PlaySquare as Youtube } from "lucide-react";
import { api, ApiError } from "@/src/lib/api";
import { retryBusy } from "@/src/lib/ai-client";
import { useProjects } from "@/src/components/projects/ProjectsProvider";
import { useIntel } from "@/src/components/intelligence/IntelProvider";
import { emptyStrategyBrief } from "@/src/lib/intelligence/profiles";
import { Button } from "@/src/components/ui/Button";
import { Input, Select } from "@/src/components/ui/fields";
import { Alert } from "@/src/components/ui/Alert";
import { cx } from "@/src/components/ui/cx";
import type { ContentIdea, IdeasResult, StudiedVideo } from "@/src/server/content/ideas";

const SAVE_KEY = "content-creator-last";
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

function VideoRow({ v, label }: { v: StudiedVideo; label: string }) {
  return (
    <a href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer" className="flex gap-3 rounded-lg p-2 hover:bg-muted">
      <span className="w-7 shrink-0 pt-1 text-xs font-bold text-muted-text">{label}</span>
      {v.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail.
        <img src={v.thumbnail} alt="" className="aspect-video w-28 shrink-0 rounded-md object-cover" />
      ) : null}
      <span className="min-w-0">
        <span className="line-clamp-2 text-sm font-medium">{v.title}</span>
        <span className="mt-0.5 block text-xs text-muted-text">
          {v.channel ? `${v.channel} · ` : ""}
          {compact.format(v.views)} views · {compact.format(v.viewsPerDay)}/day
          {v.lift >= 1.2 && <span className="ml-1 font-semibold text-success">{v.lift.toFixed(1)}× median</span>}
        </span>
      </span>
    </a>
  );
}

/**
 * Content Creator: studies the connected channel and the niche on YouTube,
 * then writes ideas that build on what already works — each one citing the
 * videos behind it — and turns any idea into a project in one click.
 */
export function ContentCreator() {
  const router = useRouter();
  const projects = useProjects();
  const intel = useIntel();
  const [connected, setConnected] = useState<{ title: string } | null | undefined>(undefined);
  const [niche, setNiche] = useState("");
  const [audience, setAudience] = useState("");
  const [count, setCount] = useState("10");
  const [format, setFormat] = useState<"any" | "long" | "short">("any");
  const [useChannel, setUseChannel] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<IdeasResult | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  // The last study is saved to the account, so it is here on return.
  const saved = (() => {
    try {
      const raw = intel.outputFor("_workspace", SAVE_KEY)?.text;
      return raw ? (JSON.parse(raw) as IdeasResult) : null;
    } catch {
      return null;
    }
  })();
  const result = fresh ?? saved;

  useEffect(() => {
    api
      .get<{ connection: { channelTitle?: string; title?: string } | null }>("/api/v1/youtube/connection")
      .then((d) => setConnected(d.connection ? { title: d.connection.channelTitle ?? d.connection.title ?? "your channel" } : null))
      .catch(() => setConnected(null));
  }, []);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!niche.trim() && !(connected && useChannel)) {
      setError("Enter your niche, or connect your YouTube channel so the ideas can be based on it.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await retryBusy(() =>
        api.post<IdeasResult>("/api/v1/content-ideas", { niche, audience, count: Number(count), format, useChannel: Boolean(connected) && useChannel }),
      );
      setFresh(data);
      intel.saveOutputFor("_workspace", SAVE_KEY, JSON.stringify(data), "Content ideas");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create ideas right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function startVideo(idea: ContentIdea) {
    if (!result) return;
    const channelName = result.channel?.title || result.niche;
    const channel = projects.channels.find((c) => c.name === channelName) ?? projects.addChannel(channelName, result.niche);
    const short = idea.format === "Short";
    const existing = projects.projects.find((p) => p.channelId === channel.id && p.name.trim().toLowerCase() === idea.title.trim().toLowerCase());
    if (existing) {
      router.push(`/studio/script?project=${existing.id}`);
      return;
    }
    const project = projects.create({
      name: idea.title,
      contentType: short ? "Short" : "Long-form video",
      platform: short ? "YouTube Shorts" : "YouTube",
      channelId: channel.id,
      topic: idea.title,
      description: [`Hook: ${idea.hook}`, `Angle: ${idea.angle}`, idea.pillar && `Pillar: ${idea.pillar}`, `Why it works: ${idea.whyItWorks}`].filter(Boolean).join("\n"),
      goal: idea.whyItWorks.slice(0, 280),
    });
    intel.saveStrategyFor(project.id, {
      ...emptyStrategyBrief(new Date().toISOString()),
      topic: idea.title,
      angle: idea.angle,
      promise: idea.hook,
      takeaway: idea.angle,
      hook: idea.hook,
    });
    router.push(`/studio/script?project=${project.id}`);
  }

  const labelFor = (tag: string, i: number) => `${tag}${i + 1}`;

  return (
    <div className="space-y-6">
      <form onSubmit={generate} className="space-y-4 rounded-2xl border border-border bg-surface p-5">
        {connected === undefined ? (
          <div className="h-10 animate-pulse rounded-lg bg-muted" />
        ) : connected ? (
          <label className="flex items-start gap-3 rounded-xl border border-border bg-background p-3 text-sm">
            <input type="checkbox" checked={useChannel} onChange={(e) => setUseChannel(e.target.checked)} className="mt-1" />
            <span>
              <span className="flex items-center gap-1.5 font-medium">
                <Youtube className="size-4 text-destructive" aria-hidden="true" /> Study my channel{connected.title ? ` — ${connected.title}` : ""}
              </span>
              <span className="block text-xs text-muted-text">Reads your recent uploads to learn what already works for your audience.</span>
            </span>
          </label>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-border p-3 text-sm">
            <span className="text-muted-text">Connect your YouTube channel so ideas build on what already works for you.</span>
            <Button type="button" size="sm" variant="outline" onClick={() => router.push("/youtube")}>
              <Youtube className="size-4" aria-hidden="true" /> Connect channel
            </Button>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Niche" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder={connected && useChannel ? "Optional — e.g. personal finance for students" : "e.g. personal finance for students"} maxLength={120} />
          <Input label="Audience (optional)" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. first-job 20-somethings" maxLength={200} />
          <Select label="Format" value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
            <option value="any">Long-form + Shorts</option>
            <option value="long">Long-form only</option>
            <option value="short">Shorts only</option>
          </Select>
          <Select label="How many ideas" value={count} onChange={(e) => setCount(e.target.value)}>
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="15">15</option>
            <option value="20">20</option>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
            {busy ? "Studying and writing…" : result ? "Create new ideas" : "Create ideas"}
          </Button>
          {busy && <span className="text-xs text-muted-text">Reading your channel and what&apos;s winning in the niche — about 20–40 seconds.</span>}
        </div>
        {error && <Alert tone="bad" title="Content Creator">{error}</Alert>}
      </form>

      {result && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {result.channel && (
              <section aria-label="Channel study" className="rounded-2xl border border-border bg-surface p-4">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <BarChart3 className="size-4 text-muted-text" aria-hidden="true" /> What works on {result.channel.title}
                </h2>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Videos studied", String(result.channel.analysed)],
                    ["Median views", compact.format(result.channel.medianViews)],
                    ["Uploads / month", String(result.channel.uploadsPerMonth || "—")],
                  ].map(([l, v]) => (
                    <div key={l} className="rounded-lg border border-border p-2">
                      <div className="text-lg font-bold">{v}</div>
                      <div className="text-[11px] text-muted-text">{l}</div>
                    </div>
                  ))}
                </div>
                {result.channel.top.length > 0 ? (
                  <div className="mt-3 space-y-1">
                    <p className="text-xs font-semibold text-muted-text">Your best performers</p>
                    {result.channel.top.map((v, i) => <VideoRow key={v.id} v={v} label={labelFor("C", i)} />)}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-text">Not enough public videos yet to spot patterns — ideas lean on the niche.</p>
                )}
              </section>
            )}
            {result.market && (
              <section aria-label="Niche leaders" className="rounded-2xl border border-border bg-surface p-4">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <TrendingUp className="size-4 text-muted-text" aria-hidden="true" /> Winning in “{result.market.query}” now
                </h2>
                <p className="mt-1 text-xs text-muted-text">Ranked by views per day · niche median {compact.format(result.market.medianViewsPerDay)}/day</p>
                <div className="mt-2 space-y-1">
                  {result.market.leaders.slice(0, 6).map((v, i) => <VideoRow key={v.id} v={v} label={labelFor("N", i)} />)}
                </div>
              </section>
            )}
          </div>

          <section aria-label="Ideas" className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Lightbulb className="size-5 text-warning" aria-hidden="true" /> {result.ideas.length} ideas for {result.channel?.title || result.niche}
            </h2>
            <ol className="grid gap-3 lg:grid-cols-2">
              {result.ideas.map((idea, i) => {
                const exists = projects.projects.some((p) => p.name.trim().toLowerCase() === idea.title.trim().toLowerCase());
                return (
                  <li key={`${idea.title}-${i}`} className="flex flex-col rounded-2xl border border-border bg-surface p-4">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                      <span className="rounded-full bg-muted px-2 py-0.5">{idea.format}</span>
                      {idea.pillar && <span className="rounded-full bg-muted px-2 py-0.5">{idea.pillar}</span>}
                      <span
                        className={cx(
                          "rounded-full px-2 py-0.5",
                          idea.confidence === "High" ? "bg-success/15 text-success" : idea.confidence === "Medium" ? "bg-primary/15 text-primary" : "bg-warning/15 text-warning",
                        )}
                      >
                        {idea.confidence === "Test" ? "Worth testing" : `${idea.confidence} confidence`}
                      </span>
                    </div>
                    <h3 className="mt-2 text-base font-semibold leading-snug">{idea.title}</h3>
                    <p className="mt-2 text-sm">
                      <span className="font-medium">Hook: </span>
                      <span className="text-muted-text">“{idea.hook}”</span>
                    </p>
                    <p className="mt-1 text-sm">
                      <span className="font-medium">Angle: </span>
                      <span className="text-muted-text">{idea.angle}</span>
                    </p>
                    <p className="mt-1 text-sm">
                      <span className="font-medium">Why it works: </span>
                      <span className="text-muted-text">{idea.whyItWorks}</span>
                    </p>
                    {idea.evidence.length > 0 && (
                      <ul className="mt-2 space-y-0.5 text-xs text-muted-text">
                        {idea.evidence.map((e) => (
                          <li key={e}>• {e}</li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-2 grid gap-1 text-xs text-muted-text sm:grid-cols-2">
                      {idea.thumbnail && <p><span className="font-medium text-foreground">Thumbnail: </span>{idea.thumbnail}</p>}
                      {idea.searchPhrase && <p><span className="font-medium text-foreground">Search: </span>{idea.searchPhrase}</p>}
                    </div>
                    <div className="mt-auto flex flex-wrap gap-2 pt-3">
                      <Button size="sm" onClick={() => startVideo(idea)}>
                        <Clapperboard className="size-4" aria-hidden="true" /> {exists ? "Open video" : "Start this video"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          void navigator.clipboard?.writeText(`${idea.title}\n\nHook: ${idea.hook}\nAngle: ${idea.angle}\nThumbnail: ${idea.thumbnail}`).then(() => {
                            setCopied(i);
                            window.setTimeout(() => setCopied(null), 1500);
                          });
                        }}
                      >
                        {copied === i ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                        {copied === i ? "Copied" : "Copy"}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="text-xs text-muted-text">Created {new Date(result.generatedAt).toLocaleString()} · C = your videos, N = niche leaders.</p>
          </section>
        </>
      )}
    </div>
  );
}
