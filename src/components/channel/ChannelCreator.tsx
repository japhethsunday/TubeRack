"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Rocket, Copy, Check, Loader2, Trash2, CalendarPlus, Clapperboard, Plus } from "lucide-react";
import { api, ApiError } from "@/src/lib/api";
import { retryBusy } from "@/src/lib/ai-client";
import type { ChannelEvidence, ChannelInputs, ChannelPlan } from "@/src/lib/channel/plan";
import { channelKeywordsField } from "@/src/lib/channel/plan";
import { CATEGORIES } from "@/src/lib/market/signals";
import { REGIONS, regionName } from "@/src/lib/market/regions";
import { useProjects } from "@/src/components/projects/ProjectsProvider";
import { useIntel } from "@/src/components/intelligence/IntelProvider";
import { emptyAudienceProfile, emptyStrategyBrief } from "@/src/lib/intelligence/profiles";
import { Button } from "@/src/components/ui/Button";
import { Input, Select, Textarea } from "@/src/components/ui/fields";
import { cx } from "@/src/components/ui/cx";
import { ChannelSetup } from "@/src/components/channel/ChannelSetup";

interface PlanRow {
  id: string;
  niche: string;
  region: string;
  inputs: ChannelInputs & { category?: string };
  plan: ChannelPlan;
  evidence: ChannelEvidence;
  model: string;
  applied: Record<string, unknown>;
  created_at: string;
}
interface PlanListItem {
  id: string;
  niche: string;
  region: string;
  lead_name: string | null;
  created_at: string;
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-text hover:bg-muted hover:text-foreground"
      aria-label={`${label} to clipboard`}
    >
      {done ? <Check className="size-3.5 text-success" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
      {done ? "Copied" : label}
    </button>
  );
}

function Section({ title, copy, children }: { title: string; copy?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border py-5 last:border-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {copy && <CopyButton text={copy} />}
      </div>
      {children}
    </section>
  );
}

const List = ({ items }: { items: string[] }) => (
  <ul className="space-y-1 text-sm">
    {items.map((x) => (
      <li key={x} className="flex gap-2">
        <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-text" aria-hidden="true" />
        {x}
      </li>
    ))}
  </ul>
);

export function ChannelCreator() {
  const params = useSearchParams();
  const router = useRouter();
  const projects = useProjects();
  const intel = useIntel();
  const [form, setForm] = useState({
    niche: params.get("niche") ?? "",
    query: params.get("query") ?? "",
    category: params.get("category") ?? "",
    audience: "",
    region: params.get("region") ?? "US",
    contentType: "mixed" as ChannelInputs["contentType"],
    platform: "both" as ChannelInputs["platform"],
    style: "",
    competitors: ["", "", ""],
    brandName: "",
  });
  const [plans, setPlans] = useState<PlanListItem[]>([]);
  const [current, setCurrent] = useState<PlanRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const planId = params.get("plan");

  useEffect(() => {
    api.get<PlanListItem[]>("/api/v1/channel-plans").then(setPlans).catch(() => setPlans([]));
  }, []);

  useEffect(() => {
    if (!planId) return;
    let alive = true;
    api
      .get<PlanRow>(`/api/v1/channel-plans/${encodeURIComponent(planId)}`)
      .then((p) => alive && setCurrent(p))
      .catch((e: unknown) => alive && setError(e instanceof ApiError ? e.message : "Could not open that plan."));
    return () => {
      alive = false;
    };
  }, [planId]);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (form.niche.trim().length < 2) {
      setError("Enter a niche.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const row = await retryBusy(() => api.post<PlanRow>("/api/v1/channel-plans", { ...form, competitors: form.competitors.map((c) => c.trim()).filter(Boolean) }));
      setPlans((p) => [{ id: row.id, niche: row.niche, region: row.region, lead_name: row.plan.names[0]?.name ?? null, created_at: row.created_at }, ...p]);
      setCurrent(row);
      router.replace(`/channel-creator?plan=${row.id}`, { scroll: false });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not build the channel plan.");
    } finally {
      setBusy(false);
    }
  }

  async function removePlan(id: string) {
    await api.remove(`/api/v1/channel-plans/${encodeURIComponent(id)}`).catch(() => undefined);
    setPlans((p) => p.filter((x) => x.id !== id));
    if (current?.id === id) {
      setCurrent(null);
      router.replace("/channel-creator", { scroll: false });
    }
  }

  /**
   * Idea → real project with a complete brief (audience, strategy, approved
   * hook), then straight into the Script Studio, which writes the draft.
   */
  function startVideo(idea: ChannelPlan["ideas"][number]) {
    if (!current) return;
    const p = current.plan;
    const channelName = p.names[0]?.name ?? current.niche;
    const channel = projects.channels.find((c) => c.name === channelName) ?? projects.addChannel(channelName, current.niche);
    const short = /short/i.test(idea.format);
    const format = p.formats.find((f) => f.name.toLowerCase() === idea.format.toLowerCase());
    const project = projects.create({
      name: idea.title,
      contentType: short ? "Short" : "Long-form video",
      platform: short ? "YouTube Shorts" : "YouTube",
      channelId: channel.id,
      topic: idea.title,
      description: [idea.hook && `Hook: ${idea.hook}`, idea.angle && `Angle: ${idea.angle}`, idea.pillar && `Pillar: ${idea.pillar}`].filter(Boolean).join("\n"),
      goal: p.positioning.slice(0, 280),
    });
    const now = new Date().toISOString();
    intel.saveAudienceFor(project.id, {
      ...emptyAudienceProfile(now),
      primary: p.audience.primary,
      problem: p.audience.painPoints[0] ?? "",
      desire: p.audience.goals[0] ?? "",
      pains: p.audience.painPoints.join("; "),
      intent: p.audience.watchContext,
    });
    const pillar = p.pillars.find((x) => x.name === idea.pillar);
    intel.saveStrategyFor(project.id, {
      ...emptyStrategyBrief(now),
      topic: idea.title,
      angle: idea.angle,
      positioning: p.positioning,
      promise: idea.hook,
      takeaway: idea.angle,
      points: [pillar?.purpose, ...p.audience.goals.slice(0, 2)].filter(Boolean).join("\n"),
      hook: idea.hook,
      narrative: `Brand voice: ${p.brand.voice}`,
      format: idea.format,
      length: format?.length ?? (short ? "Under 60 seconds" : ""),
      intent: p.audience.watchContext,
      differentiation: p.competitors.map((c) => c.gap).filter(Boolean).slice(0, 2).join("; "),
      cta: `Subscribe to ${channelName} for more on ${current.niche}.`,
    });
    if (idea.hook) intel.addHook(project.id, idea.hook, "From Channel Creator plan");
    router.push(`/studio/script?project=${project.id}&autowrite=1`);
  }

  async function scheduleIdeas() {
    if (!current) return;
    const days = current.plan.publishing.days.map((d) => d.toLowerCase().slice(0, 3));
    const dow = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const wanted = days.map((d) => dow.indexOf(d)).filter((i) => i >= 0);
    const slots: string[] = [];
    const d = new Date();
    d.setDate(d.getDate() + 1);
    while (slots.length < current.plan.ideas.length && slots.length < 60) {
      if (wanted.length === 0 || wanted.includes(d.getDay())) slots.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
    try {
      let n = 0;
      for (const [i, idea] of current.plan.ideas.entries()) {
        await api.post("/api/v1/calendar", { title: idea.title, kind: "publish", date: slots[i], notes: [idea.format, idea.hook].filter(Boolean).join(" — "), remind: true });
        n++;
      }
      setNotice(`${n} ideas added to your content calendar.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add ideas to the calendar.");
    }
  }

  const plan = current?.plan;
  const ev = current?.evidence;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const keywordsField = useMemo(() => (plan ? channelKeywordsField(plan.channelKeywords) : ""), [plan]);

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="space-y-3">
        <Button className="w-full" variant={current ? "outline" : "primary"} onClick={() => { setCurrent(null); router.replace("/channel-creator", { scroll: false }); }}>
          <Plus className="size-4" aria-hidden="true" /> New channel plan
        </Button>
        <div>
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-text">Saved plans</p>
          {plans.length === 0 ? (
            <p className="mt-2 px-1 text-sm text-muted-text">None yet.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {plans.map((p) => (
                <li key={p.id} className={cx("group flex items-center gap-1 rounded-lg", current?.id === p.id ? "bg-muted" : "hover:bg-muted/60")}>
                  <Link href={`/channel-creator?plan=${p.id}`} className="min-w-0 flex-1 px-2.5 py-2">
                    <span className="block truncate text-sm font-medium">{p.lead_name ?? p.niche}</span>
                    <span className="block truncate text-xs text-muted-text">{p.niche} · {regionName(p.region) || "Worldwide"} · {new Date(p.created_at).toLocaleDateString()}</span>
                  </Link>
                  <button type="button" onClick={() => void removePlan(p.id)} aria-label={`Delete plan ${p.niche}`} className="mr-1 rounded p-1 text-muted-text opacity-0 hover:text-destructive group-hover:opacity-100 focus:opacity-100">
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <div className="min-w-0">
        {error && <p className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
        {notice && <p className="mb-3 rounded-lg bg-success/10 px-3 py-2 text-sm text-success" role="status">{notice}</p>}

        {!current ? (
          <form onSubmit={generate} className="space-y-4 rounded-xl border border-border bg-surface p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Niche" required value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} placeholder="e.g. Personal finance for nurses" />
              <Input label="Search phrase (optional)" value={form.query} onChange={(e) => setForm({ ...form, query: e.target.value })} placeholder="What viewers type into YouTube" hint="Used to measure the market. Defaults to the niche." />
              <Input label="Target audience" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} placeholder="e.g. UK nurses in their first 5 years" />
              <Select label="Country / market" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}>
                {REGIONS.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
              </Select>
              <Select label="Content type" value={form.contentType} onChange={(e) => setForm({ ...form, contentType: e.target.value as ChannelInputs["contentType"] })}>
                <option value="mixed">Mixed</option>
                <option value="on-camera">On camera</option>
                <option value="faceless">Faceless (voice-over + visuals)</option>
                <option value="screen-recording">Screen recording / tutorials</option>
                <option value="animation">Animation</option>
              </Select>
              <Select label="Platform" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value as ChannelInputs["platform"] })}>
                <option value="both">YouTube long-form + Shorts</option>
                <option value="youtube">YouTube long-form</option>
                <option value="youtube-shorts">YouTube Shorts</option>
              </Select>
              <Select label="Advertiser category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} hint="Detected from the niche if left automatic.">
                <option value="">Automatic</option>
                {Object.values(CATEGORIES).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
              <Input label="Channel style" value={form.style} onChange={(e) => setForm({ ...form, style: e.target.value })} placeholder="e.g. calm, data-led explainers" />
              <Input label="Personal or company name (optional)" value={form.brandName} onChange={(e) => setForm({ ...form, brandName: e.target.value })} />
            </div>
            <fieldset>
              <legend className="text-xs font-medium">Competitor channels (optional)</legend>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
                {form.competitors.map((c, i) => (
                  <input
                    key={i}
                    value={c}
                    onChange={(e) => setForm({ ...form, competitors: form.competitors.map((x, j) => (j === i ? e.target.value : x)) })}
                    placeholder="@handle or channel URL"
                    aria-label={`Competitor ${i + 1}`}
                    className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
                  />
                ))}
              </div>
            </fieldset>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Rocket className="size-4" aria-hidden="true" />}
                {busy ? "Building plan…" : "Build channel plan"}
              </Button>
              {busy && <span className="text-xs text-muted-text">Measuring the market and competitors, then writing the plan — usually 30–60 seconds.</span>}
            </div>
          </form>
        ) : plan ? (
          <div className="space-y-6">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{plan.names[0]?.name ?? current.niche}</h2>
                <p className="text-sm text-muted-text">{current.niche} · {regionName(current.region) || "Worldwide"} · {new Date(current.created_at).toLocaleString()}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => void scheduleIdeas()}>
                  <CalendarPlus className="size-4" aria-hidden="true" /> Schedule 30 ideas
                </Button>
                {plan.ideas[0] && (
                  <Button size="sm" onClick={() => startVideo(plan.ideas[0])}>
                    <Clapperboard className="size-4" aria-hidden="true" /> Start first video
                  </Button>
                )}
              </div>
            </header>

            {ev && (
              <div className="rounded-xl border border-border bg-surface p-4 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-text">Evidence this plan is built on</p>
                {ev.market ? (
                  <p className="mt-2">
                    Top {regionName(current.region) || "worldwide"} videos for “{current.inputs.query}” average {ev.market.medianViewsPerDay.toLocaleString()} views/day; {pct(ev.market.sponsoredShare)} sponsored, {pct(ev.market.affiliateShare)} affiliate, {pct(ev.market.digitalShare)} own products. Advertiser category {ev.market.category} (tier {ev.market.tier}/5, estimate). Scanned {new Date(ev.market.scannedAt).toLocaleDateString()}.
                  </p>
                ) : (
                  <p className="mt-2 text-muted-text">No market scan was available for this plan.</p>
                )}
                {ev.competitors.length > 0 && (
                  <p className="mt-1">Competitors read live: {ev.competitors.map((c) => `${c.title}${c.subscribers !== null ? ` (${c.subscribers.toLocaleString()} subs)` : ""}`).join(", ")}.</p>
                )}
                {ev.notes.map((n) => <p key={n} className="mt-1 text-warning">{n}</p>)}
              </div>
            )}

            <ChannelSetup plan={plan} planId={current.id} region={current.region} keywordsField={keywordsField} />

            <div className="rounded-xl border border-border bg-surface px-5">
              <Section title="Channel name options">
                <ul className="grid gap-2 sm:grid-cols-2">
                  {plan.names.map((n) => (
                    <li key={n.name} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{n.name}</span>
                        <CopyButton text={n.name} />
                      </div>
                      <p className="mt-1 text-xs text-muted-text">{n.why}</p>
                    </li>
                  ))}
                </ul>
              </Section>
              <Section title="Handles (checked on YouTube)">
                <ul className="flex flex-wrap gap-2">
                  {plan.handles.map((h) => (
                    <li key={h.handle} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm">
                      <span className="font-mono">@{h.handle}</span>
                      <span className={cx("rounded px-1.5 text-[11px] font-medium", h.available === true ? "bg-success/15 text-success" : h.available === false ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-text")}>
                        {h.available === true ? "Available" : h.available === false ? "Taken" : "Unchecked"}
                      </span>
                      <CopyButton text={`@${h.handle}`} label="" />
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-text">Availability was checked when the plan was created and isn’t reserved — claim your pick in YouTube Studio.</p>
              </Section>
              <Section title="Positioning" copy={plan.positioning}><p className="text-sm">{plan.positioning}</p></Section>
              <Section title="Tagline" copy={plan.tagline}><p className="text-sm font-medium">{plan.tagline}</p></Section>
              <Section title="About / channel description" copy={plan.about}>
                <p className="whitespace-pre-line text-sm">{plan.about}</p>
                <p className="mt-1 text-xs text-muted-text">{plan.about.length}/1000 characters</p>
              </Section>
              <Section title="Brand direction">
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <p><span className="text-muted-text">Voice: </span>{plan.brand.voice}</p>
                  <p><span className="text-muted-text">Visual style: </span>{plan.brand.visualStyle}</p>
                  <p><span className="text-muted-text">Typography: </span>{plan.brand.typography}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-text">Colours:</span>
                    {plan.brand.colors.map((c) => (
                      <span key={c} className="flex items-center gap-1 font-mono text-xs"><span className="size-4 rounded border border-border" style={{ background: /^#[0-9a-f]{3,8}$/i.test(c) ? c : undefined }} />{c}</span>
                    ))}
                  </div>
                  <div><p className="text-xs font-medium text-muted-text">Do</p><List items={plan.brand.dos} /></div>
                  <div><p className="text-xs font-medium text-muted-text">Don’t</p><List items={plan.brand.donts} /></div>
                </div>
              </Section>
              <Section title="Target audience">
                <p className="text-sm">{plan.audience.primary}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div><p className="text-xs font-medium text-muted-text">Pain points</p><List items={plan.audience.painPoints} /></div>
                  <div><p className="text-xs font-medium text-muted-text">Goals</p><List items={plan.audience.goals} /></div>
                </div>
                <p className="mt-2 text-sm"><span className="text-muted-text">When and how they watch: </span>{plan.audience.watchContext}</p>
              </Section>
              <Section title="Content pillars">
                <ul className="space-y-2">
                  {plan.pillars.map((p) => (
                    <li key={p.name} className="text-sm">
                      <div className="flex items-center justify-between"><span className="font-medium">{p.name}</span><span className="tabular-nums text-muted-text">{p.share}%</span></div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${p.share}%` }} /></div>
                      <p className="mt-1 text-xs text-muted-text">{p.purpose}</p>
                    </li>
                  ))}
                </ul>
                {plan.categories.length > 0 && <p className="mt-3 text-sm"><span className="text-muted-text">Categories: </span>{plan.categories.join(" · ")}</p>}
              </Section>
              <Section title="Video formats">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-muted-text"><th className="py-1 pr-3 font-medium">Format</th><th className="py-1 pr-3 font-medium">Length</th><th className="py-1 pr-3 font-medium">Cadence</th><th className="py-1 font-medium">Why</th></tr></thead>
                    <tbody className="divide-y divide-border">
                      {plan.formats.map((f) => <tr key={f.name}><td className="py-2 pr-3 font-medium">{f.name}</td><td className="py-2 pr-3">{f.length}</td><td className="py-2 pr-3">{f.cadence}</td><td className="py-2 text-muted-text">{f.why}</td></tr>)}
                    </tbody>
                  </table>
                </div>
              </Section>
              <Section title={`First ${plan.ideas.length} content ideas`} copy={plan.ideas.map((i, n) => `${n + 1}. ${i.title}`).join("\n")}>
                <ol className="divide-y divide-border">
                  {plan.ideas.map((idea, i) => (
                    <li key={`${i}-${idea.title}`} className="flex flex-wrap items-start gap-3 py-2.5">
                      <span className="w-6 shrink-0 pt-0.5 text-xs tabular-nums text-muted-text">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{idea.title}</p>
                        <p className="text-xs text-muted-text">{[idea.pillar, idea.format].filter(Boolean).join(" · ")}{idea.hook ? ` — ${idea.hook}` : ""}</p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => startVideo(idea)}>
                        <Clapperboard className="size-3.5" aria-hidden="true" /> Create
                      </Button>
                    </li>
                  ))}
                </ol>
              </Section>
              <Section title="Title patterns" copy={plan.titlePatterns.join("\n")}><List items={plan.titlePatterns} /></Section>
              <Section title="Thumbnail direction"><p className="text-sm">{plan.thumbnail.style}</p><div className="mt-2"><List items={plan.thumbnail.rules} /></div></Section>
              <Section title="Publishing strategy">
                <p className="text-sm">{plan.publishing.cadence}{plan.publishing.days.length ? ` · ${plan.publishing.days.join(", ")}` : ""}{plan.publishing.time ? ` · ${plan.publishing.time}` : ""}</p>
                <p className="mt-2 text-xs font-medium text-muted-text">First 90 days</p>
                <List items={plan.publishing.first90Days} />
              </Section>
              <Section title="Monetisation strategy">
                <div className="grid gap-3 sm:grid-cols-3">
                  {plan.monetisation.map((m) => <div key={m.stage}><p className="text-sm font-medium">{m.stage}</p><List items={m.actions} /></div>)}
                </div>
              </Section>
              {plan.competitors.length > 0 && (
                <Section title="Competitor positioning">
                  <ul className="space-y-2 text-sm">
                    {plan.competitors.map((c) => <li key={c.name}><span className="font-medium">{c.name}</span> — <span className="text-muted-text">strength:</span> {c.strength} <span className="text-muted-text">· gap:</span> {c.gap}</li>)}
                  </ul>
                </Section>
              )}
              <Section title="SEO keywords" copy={plan.seoKeywords.join(", ")}><p className="text-sm">{plan.seoKeywords.join(" · ")}</p></Section>
              <Section title="Channel keywords (YouTube field)" copy={keywordsField}><p className="font-mono text-xs">{keywordsField}</p></Section>
              <Section title="Launch checklist"><List items={plan.launchChecklist} /></Section>
            </div>
            <p className="text-xs text-muted-text">Written by {current.model} from the evidence above. Numbers in the plan come only from that evidence.</p>
          </div>
        ) : (
          <div className="h-40 animate-pulse rounded-xl bg-muted" aria-busy="true" />
        )}
      </div>
    </div>
  );
}

