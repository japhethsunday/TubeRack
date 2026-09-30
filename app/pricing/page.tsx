import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { getDb } from "@/src/server/db";
import { SiteHeader } from "@/src/components/home/SiteHeader";
import { SiteFooter } from "@/src/components/home/SiteFooter";

export const metadata: Metadata = {
  title: "Pricing · Recktube",
  description: "Simple monthly plans and credit packs for Recktube. Start free with 100 credits every month.",
  alternates: { canonical: "/pricing" },
};

// Prices come from Admin → Plans, so the page always shows the current ones.
export const revalidate = 300;

interface Plan { id: string; name: string; kind: "subscription" | "pack"; priceMinor: number; currency: string; credits: number; description: string }

async function plans(): Promise<Plan[]> {
  try {
    const db = getDb();
    if (!db) return [];
    const rows = await db`SELECT id, name, kind, price_minor, currency, credits, description FROM plans WHERE active = true ORDER BY sort, price_minor`;
    return rows.map((r) => ({ id: String(r.id), name: String(r.name), kind: r.kind === "pack" ? "pack" : "subscription", priceMinor: Number(r.price_minor), currency: String(r.currency), credits: Number(r.credits), description: String(r.description ?? "") }));
  } catch {
    return [];
  }
}

const SYMBOL: Record<string, string> = { USD: "$", NGN: "₦", GHS: "GH₵", KES: "KSh ", ZAR: "R" };
const money = (minor: number, cur: string) => {
  const v = minor / 100;
  return `${SYMBOL[cur] ?? `${cur} `}${Number.isInteger(v) ? v.toLocaleString("en-US") : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const EVERY_PLAN = ["Script Studio, Content Creator and Channel Creator", "Full video generation: voice-over, visuals, music, captions, thumbnail", "Video Studio editor and MP4 export", "Publish and schedule to YouTube, post to TikTok", "Trend Radar, niche research and analytics"];
const PAID_EXTRAS = ["AI video clips and AI motion", "More credits every month"];

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
            Every account gets 100 free credits every month. Upgrade when you post more. Prices are per month, billed monthly; cancel any time.
          </p>
        </div>

        <ul className={`mt-10 grid gap-4 sm:grid-cols-2 ${subs.length >= 3 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
          <li className="flex flex-col rounded-3xl border border-foreground/10 bg-foreground/[0.02] p-6">
            <h2 className="text-lg font-semibold">Free</h2>
            <p className="mt-3"><span className="text-4xl font-bold tracking-tight">{money(0, subs[0]?.currency ?? "USD")}</span><span className="text-sm text-foreground/60"> / month</span></p>
            <p className="mt-1 text-sm font-medium text-violet-700 dark:text-violet-300">100 credits every month</p>
            <p className="mt-3 text-sm leading-relaxed text-foreground/70">Try everything: about one full generated video, or 10 images, each month.</p>
            <Features items={EVERY_PLAN} />
            <Link href="/signup" className="mt-6 inline-flex h-11 items-center justify-center rounded-xl border border-foreground/15 text-sm font-semibold transition hover:bg-foreground/5">Start free</Link>
          </li>
          {subs.map((p) => {
            const hot = p.id === featured;
            return (
              <li key={p.id} className={`relative flex flex-col rounded-3xl border p-6 ${hot ? "border-violet-500/60 bg-violet-500/[0.06] shadow-xl shadow-violet-900/10" : "border-foreground/10 bg-foreground/[0.02]"}`}>
                {hot && <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-r from-fuchsia-600 via-violet-600 to-sky-600 px-3 py-1 text-[11px] font-semibold text-white">Most popular</span>}
                <h2 className="text-lg font-semibold">{p.name}</h2>
                <p className="mt-3"><span className="text-4xl font-bold tracking-tight">{money(p.priceMinor, p.currency)}</span><span className="text-sm text-foreground/60"> / month</span></p>
                <p className="mt-1 text-sm font-medium text-violet-700 dark:text-violet-300">{p.credits.toLocaleString("en-US")} credits every month</p>
                {p.description && <p className="mt-3 text-sm leading-relaxed text-foreground/70">{p.description}</p>}
                <Features items={["Everything in Free", ...PAID_EXTRAS]} />
                <Link href="/signup" className={`mt-6 inline-flex h-11 items-center justify-center rounded-xl text-sm font-semibold transition ${hot ? "bg-gradient-to-r from-fuchsia-600 via-violet-600 to-sky-600 text-white hover:brightness-110" : "border border-foreground/15 hover:bg-foreground/5"}`}>Choose {p.name}</Link>
              </li>
            );
          })}
        </ul>

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
            <Faq q="Do unused monthly credits roll over?" a="Every 30 days your balance is topped back up to your plan's monthly amount. Credits above that amount, such as a credit pack, are kept." />
            <Faq q="Refunds" a="If something went wrong with a payment, email support@recktube.xyz within 7 days and we'll make it right." />
          </div>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}

function Features({ items }: { items: string[] }) {
  return (
    <ul className="mt-5 flex-1 space-y-2 text-sm">
      {items.map((f) => (
        <li key={f} className="flex gap-2 text-foreground/80">
          <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden="true" /> {f}
        </li>
      ))}
    </ul>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4">
      <p className="font-semibold">{q}</p>
      <p className="mt-1 leading-relaxed text-foreground/70">{a}</p>
    </div>
  );
}
