import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { Check, X } from "lucide-react";
import { getDb } from "@/src/server/db";
import { SiteHeader } from "@/src/components/home/SiteHeader";
import { SiteFooter } from "@/src/components/home/SiteFooter";
import { Linkify } from "@/src/components/home/Linkify";
import { TIER_NAME, TIER_ORDER, tierOf, type Tier } from "@/src/lib/plans";

export const metadata: Metadata = {
  title: "Pricing · Recktube",
  description: "Simple monthly plans and credit packs for Recktube. Start free with 100 credits every month.",
  alternates: { canonical: "/pricing" },
};

// Prices come from Admin → Plans, so the page always shows the current ones.
export const revalidate = 300;

interface Plan { id: string; name: string; kind: "subscription" | "pack"; priceMinor: number; currency: string; credits: number; description: string }

/** Shown if the database can't be reached, so the page never loses its prices. Keep in step with Admin → Plans. */
const FALLBACK: Plan[] = [
  { id: "creator", name: "Creator", kind: "subscription", priceMinor: 500, currency: "USD", credits: 1000, description: "For creators posting every week." },
  { id: "pro", name: "Pro", kind: "subscription", priceMinor: 1200, currency: "USD", credits: 3000, description: "For growing channels posting most days." },
  { id: "studio", name: "Studio", kind: "subscription", priceMinor: 2500, currency: "USD", credits: 7000, description: "For daily posting across YouTube and TikTok." },
  { id: "pack", name: "Credit pack", kind: "pack", priceMinor: 300, currency: "USD", credits: 500, description: "A one-off top-up of 500 credits, added to your balance on any plan." },
];

async function plans(): Promise<Plan[]> {
  try {
    const db = getDb();
    if (!db) return FALLBACK;
    const rows = await db`SELECT id, name, kind, price_minor, currency, credits, description FROM plans WHERE active = true ORDER BY sort, price_minor`;
    return rows.map((r) => ({ id: String(r.id), name: String(r.name), kind: r.kind === "pack" ? "pack" : "subscription", priceMinor: Number(r.price_minor), currency: String(r.currency), credits: Number(r.credits), description: String(r.description ?? "") }));
  } catch {
    return FALLBACK;
  }
}

const SYMBOL: Record<string, string> = { USD: "$", NGN: "₦", GHS: "GH₵", KES: "KSh ", ZAR: "R" };
const money = (minor: number, cur: string) => {
  const v = minor / 100;
  return `${SYMBOL[cur] ?? `${cur} `}${Number.isInteger(v) ? v.toLocaleString("en-US") : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

type Line = { text: string; included: boolean; strong?: boolean };

/** What each plan adds on top of the one below it. */
const ADDS: Record<Tier, string[]> = {
  free: [
    "Script Studio, Media Studio and the Video Studio editor",
    "Content Creator, Trend Radar, Niche Finder and research",
    "Connect YouTube: publish and see analytics",
    "MP4 export up to 720p with a small Recktube mark",
  ],
  creator: [
    "1080p and 4K exports without the Recktube mark",
    "Storyboard, Brand kit and Design",
    "Most Paying Niches",
    "Content calendar and planning",
    "TikTok posting",
    "AI video clips and AI motion",
    "Email support",
  ],
  pro: [
    "Video Recreator",
    "Channel Creator",
    "Competitors, Content Gaps and Audience analysis",
    "Retention analysis and Channel Strategy",
    "Title and thumbnail A/B testing",
    "Priority support",
  ],
  studio: ["The biggest monthly credit allowance", "Fastest support replies"],
};

/** What a plan includes, with real numbers from its monthly credits. */
function planFeatures(credits: number, tier: Tier): Line[] {
  const videos = Math.max(1, Math.floor(credits / 100));
  const below = TIER_ORDER[TIER_ORDER.indexOf(tier) - 1];
  const out: Line[] = [
    { text: `${credits.toLocaleString("en-US")} credits every month`, included: true, strong: true },
    { text: `About ${videos} full AI-generated video${videos === 1 ? "" : "s"} a month, or up to ${Math.floor(credits / 10).toLocaleString("en-US")} AI images`, included: true },
  ];
  if (below) out.push({ text: `Everything in ${TIER_NAME[below]}, plus:`, included: true, strong: true });
  out.push(...ADDS[tier].map((text) => ({ text, included: true })));
  if (tier === "free") out.push({ text: "TikTok posting", included: false }, { text: "AI video clips and AI motion", included: false });
  if (tier !== "free") out.push({ text: "Buy extra credit packs any time", included: true });
  return out;
}

/** The full comparison table. */
const COMPARE: [group: string, rows: [label: string, need: Tier | "none", note?: Partial<Record<Tier, string>>][]][] = [
  ["Create", [
    ["Script Studio", "free"],
    ["Media Studio: images and voice-overs", "free"],
    ["Full AI video generation", "free", { free: "1 a month" }],
    ["Video Studio editor and MP4 export", "free", { free: "720p, with mark", creator: "Up to 4K", pro: "Up to 4K", studio: "Up to 4K" }],
    ["Storyboard", "creator"],
    ["Brand kit and Design", "creator"],
    ["AI video clips and AI motion", "creator"],
    ["Video Recreator", "pro"],
  ]],
  ["Research", [
    ["Content Creator", "free"],
    ["Trend Radar, Niche Finder and research", "free"],
    ["Most Paying Niches", "creator"],
    ["Competitors, Content Gaps and Audience", "pro"],
    ["Retention analysis and Channel Strategy", "pro"],
    ["Channel Creator", "pro"],
  ]],
  ["Publish and grow", [
    ["Connect YouTube: publish and analytics", "free"],
    ["Content calendar and planning", "creator"],
    ["TikTok posting", "creator"],
    ["Title and thumbnail A/B testing", "pro"],
  ]],
  ["Support", [
    ["Help Center and in-app chat", "free"],
    ["Email support", "creator"],
    ["Priority support", "pro", { studio: "Fastest replies" }],
  ]],
];

const COSTS: [string, number][] = [
  ["Full generated video", 100],
  ["AI video clip", 25],
  ["Image", 10],
  ["Voice-over", 5],
  ["Transcription", 5],
  ["Research", 2],
  ["Text: ideas, scripts, titles", 1],
];

export default async function Pricing() {
  const all = await plans();
  const subs = all.filter((p) => p.kind === "subscription");
  const packs = all.filter((p) => p.kind === "pack");
  const featured = subs[Math.min(1, subs.length - 1)]?.id;
  return (
    <main id="main" className="relative min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400">Pricing</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Simple plans. Start free.</h1>
          <p className="mt-3 text-sm leading-relaxed text-foreground/70">
            Start free with YouTube. Upgrade for more videos, TikTok posting and AI video. Prices are per month, billed monthly; cancel any time.
          </p>
        </div>

        <ul className={`mt-10 grid gap-4 sm:grid-cols-2 ${subs.length >= 3 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
          <li className="flex flex-col rounded-3xl border border-foreground/10 bg-foreground/[0.02] p-6">
            <h2 className="text-lg font-semibold">Free</h2>
            <p className="mt-3"><span className="text-4xl font-bold tracking-tight">{money(0, subs[0]?.currency ?? "USD")}</span><span className="text-sm text-foreground/60"> / month</span></p>
            <p className="mt-3 text-sm leading-relaxed text-foreground/70">Try Recktube with YouTube. No card needed.</p>
            <Features items={planFeatures(100, "free")} />
            <Link href="/signup" className="mt-6 inline-flex h-11 items-center justify-center rounded-xl border border-foreground/15 text-sm font-semibold transition hover:bg-foreground/5">Start free</Link>
          </li>
          {subs.map((p) => {
            const hot = p.id === featured;
            return (
              <li key={p.id} className={`relative flex flex-col rounded-3xl border p-6 ${hot ? "border-violet-500/60 bg-violet-500/[0.06] shadow-xl shadow-violet-900/10" : "border-foreground/10 bg-foreground/[0.02]"}`}>
                {hot && <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-r from-fuchsia-600 via-violet-600 to-sky-600 px-3 py-1 text-[11px] font-semibold text-white">Most popular</span>}
                <h2 className="text-lg font-semibold">{p.name}</h2>
                <p className="mt-3"><span className="text-4xl font-bold tracking-tight">{money(p.priceMinor, p.currency)}</span><span className="text-sm text-foreground/60"> / month</span></p>
                {p.description && <p className="mt-3 text-sm leading-relaxed text-foreground/70">{p.description}</p>}
                <Features items={planFeatures(p.credits, tierOf({ monthlyGrant: p.credits }))} />
                <Link href="/signup" className={`mt-6 inline-flex h-11 items-center justify-center rounded-xl text-sm font-semibold transition ${hot ? "bg-gradient-to-r from-fuchsia-600 via-violet-600 to-sky-600 text-white hover:brightness-110" : "border border-foreground/15 hover:bg-foreground/5"}`}>Choose {p.name}</Link>
              </li>
            );
          })}
        </ul>

        <section className="mt-12" aria-labelledby="compare">
          <h2 id="compare" className="text-lg font-semibold">Compare plans</h2>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-foreground/10">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-foreground/10 bg-foreground/[0.03]">
                  <th scope="col" className="px-4 py-3 text-left font-semibold">Tool</th>
                  {TIER_ORDER.map((t) => <th key={t} scope="col" className="px-3 py-3 text-center font-semibold">{TIER_NAME[t]}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-foreground/10">
                  <th scope="row" className="px-4 py-2.5 text-left font-normal text-foreground/80">Credits every month</th>
                  {TIER_ORDER.map((t) => <td key={t} className="px-3 py-2.5 text-center font-semibold tabular-nums">{(t === "free" ? 100 : subs.find((p) => tierOf({ monthlyGrant: p.credits }) === t)?.credits ?? 0).toLocaleString("en-US")}</td>)}
                </tr>
                {COMPARE.map(([group, rows]) => (
                  <Fragment key={group}>
                    <tr className="bg-foreground/[0.02]"><th colSpan={5} scope="colgroup" className="px-4 pb-1.5 pt-4 text-left text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">{group}</th></tr>
                    {rows.map(([label, need, note]) => (
                      <tr key={label} className="border-b border-foreground/5">
                        <th scope="row" className="px-4 py-2.5 text-left font-normal text-foreground/80">{label}</th>
                        {TIER_ORDER.map((t) => {
                          const has = need !== "none" && TIER_ORDER.indexOf(t) >= TIER_ORDER.indexOf(need);
                          return (
                            <td key={t} className="px-3 py-2.5 text-center">
                              {note?.[t] ? <span className="text-xs font-medium text-foreground/75">{note[t]}</span> : has ? <Check className="mx-auto size-4 text-emerald-500" aria-label="Included" /> : <X className="mx-auto size-4 text-foreground/25" aria-label="Not included" />}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {packs.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-semibold">Need more credits?</h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {packs.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-4 rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-5">
                  <span>
                    <span className="block font-semibold">{p.name} · {p.credits.toLocaleString("en-US")} credits</span>
                    <span className="block text-xs text-foreground/60">{p.description || "One-off top-up."}</span>
                  </span>
                  <span className="shrink-0 text-right"><span className="block text-2xl font-bold">{money(p.priceMinor, p.currency)}</span><span className="text-xs text-foreground/60">one-off</span></span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-12 grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold">What things cost in credits</h2>
            <p className="mt-1 text-sm text-foreground/60">Credits are only used when a generation succeeds. A full video that can&apos;t be made is refunded automatically.</p>
            <table className="mt-4 w-full text-sm">
              <tbody>
                {COSTS.map(([label, n]) => (
                  <tr key={label} className="border-b border-foreground/10">
                    <td className="py-2.5 text-foreground/80">{label}</td>
                    <td className="py-2.5 text-right font-semibold tabular-nums">{n} credit{n === 1 ? "" : "s"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-4 text-sm">
            <h2 className="text-lg font-semibold">Questions</h2>
            <Faq q="How do I pay?" a="Choose a plan after you sign up. Payments are processed securely by Paystack. You can also email support@recktube.xyz and we'll set up your plan." />
            <Faq q="Can I cancel?" a="Yes, any time. Your plan stays active until the end of the month you paid for, then your account returns to the Free plan." />
            <Faq q="Do unused monthly credits roll over?" a="No. Every 30 days your monthly credits reset to your plan's amount, and unused monthly credits expire. Credits from a credit pack are kept until you use them, and monthly credits are always used first." />
            <Faq q="Refunds" a="If something went wrong with a payment, email support@recktube.xyz within 7 days and we'll make it right. Full details: recktube.xyz/refund-policy" />
          </div>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}

function Features({ items }: { items: { text: string; included: boolean; strong?: boolean }[] }) {
  return (
    <ul className="mt-5 flex-1 space-y-2.5 text-sm">
      {items.map((f) => f.text.startsWith("Everything in") ? (
        <li key={f.text} className="pt-1 text-xs font-semibold uppercase tracking-wide text-foreground/55">{f.text}</li>
      ) : (
        <li key={f.text} className={`flex gap-2.5 ${f.included ? "text-foreground/85" : "text-foreground/40"}`}>
          {f.included ? <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden="true" /> : <X className="mt-0.5 size-4 shrink-0 text-foreground/35" aria-hidden="true" />}
          <span className={f.strong ? "font-semibold text-violet-700 dark:text-violet-300" : f.included ? "" : "line-through decoration-foreground/20"}>
            {f.text}
            {!f.included && <span className="sr-only"> (not included)</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4">
      <p className="font-semibold">{q}</p>
      <p className="mt-1 leading-relaxed text-foreground/70"><Linkify text={a} /></p>
    </div>
  );
}
