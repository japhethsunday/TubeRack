import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CircleCheck, CircleAlert, LifeBuoy, Mail, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { SiteHeader } from "@/src/components/home/SiteHeader";
import { SiteFooter } from "@/src/components/home/SiteFooter";
import { HelpSearch } from "@/src/components/home/HelpSearch";
import { ContactForm } from "@/src/components/home/ContactForm";
import { FEATURES, featureFlags } from "@/src/server/admin-ops";

export const metadata: Metadata = {
  title: "Support · Recktube",
  description: "Get help with Recktube: search the guides, check service status, or send us a message.",
  alternates: { canonical: "/support" },
};

// Status refreshes every minute.
export const revalidate = 60;

async function paused(): Promise<{ label: string; note: string }[]> {
  try {
    const flags = await featureFlags();
    return FEATURES.filter((f) => flags[f.id]?.off).map((f) => ({ label: f.label, note: flags[f.id]?.message ?? "" }));
  } catch {
    return [];
  }
}

const POPULAR = ["why-did-my-video-fail", "connect-youtube", "how-credits-work", "publish-and-schedule", "post-to-tiktok", "reset-password"];

export default async function Support() {
  const down = await paused();
  return (
    <main id="main" className="relative min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400">Support</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">We&apos;re here to help</h1>
          <p className="mt-3 text-sm leading-relaxed text-foreground/70">Search the guides for a quick answer, check that everything is running, or send us a message. We usually reply within a day.</p>
        </div>

        {/* Service status */}
        <div className={`mt-8 flex items-start gap-3 rounded-2xl border p-4 text-sm ${down.length ? "border-amber-500/30 bg-amber-500/[0.06]" : "border-emerald-500/30 bg-emerald-500/[0.06]"}`} role="status">
          {down.length ? <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-500" aria-hidden="true" /> : <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-500" aria-hidden="true" />}
          <div>
            <p className="font-semibold">{down.length ? "Some tools are paused right now" : "All systems are running"}</p>
            {down.length ? (
              <ul className="mt-1 space-y-0.5 text-foreground/70">
                {down.map((d) => <li key={d.label}>{d.label}{d.note ? ` — ${d.note}` : ""}</li>)}
              </ul>
            ) : (
              <p className="text-foreground/70">Video generation, publishing and every studio are available.</p>
            )}
          </div>
        </div>

        <HelpSearch popular={POPULAR} />
        <p className="mt-4 text-sm"><Link href="/help" className="inline-flex items-center gap-1.5 font-medium text-violet-700 underline-offset-4 hover:underline dark:text-violet-300"><BookOpen className="size-4" aria-hidden="true" /> Browse every guide in the Help Center</Link></p>

        <div className="mt-14 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <section aria-labelledby="contact-form">
            <h2 id="contact-form" className="text-xl font-semibold">Send us a message</h2>
            <p className="mt-1 text-sm text-foreground/60">It goes straight to our team, and we reply by email.</p>
            <div className="mt-4"><ContactForm /></div>
          </section>
          <section aria-labelledby="other-ways" className="space-y-3">
            <h2 id="other-ways" className="text-xl font-semibold">Other ways to reach us</h2>
            <Way icon={MessageCircle} title="In-app support chat" text="Signed in? Tap the chat button at the bottom-right. It checks your account and answers in seconds, and brings in a person when needed.">
              <Link href="/dashboard" className="underline underline-offset-2">Open Recktube</Link>
            </Way>
            <Way icon={LifeBuoy} title="Email support" text="Questions, video problems, billing and upgrades.">
              <a href="mailto:support@recktube.xyz" className="inline-flex items-center gap-1.5 underline underline-offset-2"><Mail className="size-3.5" aria-hidden="true" /> support@recktube.xyz</a>
            </Way>
            <Way icon={ShieldCheck} title="Security" text="Report a vulnerability or an account you think was accessed by someone else.">
              <a href="mailto:security@recktube.xyz" className="inline-flex items-center gap-1.5 underline underline-offset-2"><Mail className="size-3.5" aria-hidden="true" /> security@recktube.xyz</a>
            </Way>
            <Way icon={Sparkles} title="Partnerships and press" text="Collaborations, creators, media and business.">
              <a href="mailto:founder@recktube.xyz" className="inline-flex items-center gap-1.5 underline underline-offset-2"><Mail className="size-3.5" aria-hidden="true" /> founder@recktube.xyz</a>
            </Way>
            <p className="px-1 pt-2 text-xs text-foreground/50">
              See also: <Link href="/pricing" className="underline">Pricing</Link> · <Link href="/refund-policy" className="underline">Refunds &amp; cancellations</Link> · <Link href="/privacy" className="underline">Privacy</Link> · <Link href="/terms" className="underline">Terms</Link>
            </p>
          </section>
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}

function Way({ icon: Icon, title, text, children }: { icon: typeof Mail; title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4 text-sm">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-sky-500/20 text-violet-700 dark:text-violet-300"><Icon className="size-4" aria-hidden="true" /></span>
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 text-foreground/70">{text}</p>
        <div className="mt-1.5 font-medium text-violet-700 dark:text-violet-300">{children}</div>
      </div>
    </div>
  );
}
