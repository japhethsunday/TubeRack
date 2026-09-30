import type { Metadata } from "next";
import Link from "next/link";
import { LifeBuoy, Mail, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { SiteHeader } from "@/src/components/home/SiteHeader";
import { SiteFooter } from "@/src/components/home/SiteFooter";

export const metadata: Metadata = {
  title: "Contact · Recktube",
  description: "Get help with Recktube, report a security issue, or reach the founder.",
  alternates: { canonical: "/contact" },
};

const WAYS = [
  { icon: MessageCircle, title: "Support chat", text: "Signed in? Use the chat button at the bottom-right of the app. It checks your account and answers in seconds, and brings in a person when needed.", link: { href: "/dashboard", label: "Open the app" } },
  { icon: LifeBuoy, title: "Email support", text: "Questions, problems with a video, billing or upgrades. We usually reply within a day.", link: { href: "mailto:support@recktube.xyz", label: "support@recktube.xyz" } },
  { icon: ShieldCheck, title: "Security", text: "Found a vulnerability or think your account was accessed by someone else? Tell us privately.", link: { href: "mailto:security@recktube.xyz", label: "security@recktube.xyz" } },
  { icon: Sparkles, title: "Partnerships and press", text: "Collaborations, creators, media and business enquiries go to the founder.", link: { href: "mailto:founder@recktube.xyz", label: "founder@recktube.xyz" } },
];

export default function Contact() {
  return (
    <main id="main" className="relative min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400">Contact</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">We&apos;re here to help</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/70">
          Most answers are in the <Link href="/help" className="underline">Help Center</Link>. For anything else, pick the right way to reach us below.
        </p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {WAYS.map((w) => (
            <li key={w.title} className="rounded-3xl border border-foreground/10 bg-foreground/[0.02] p-5">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500/20 to-sky-500/20 text-violet-700 dark:text-violet-300">
                <w.icon className="size-5" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-base font-semibold">{w.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-foreground/70">{w.text}</p>
              <a href={w.link.href} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-violet-700 dark:text-violet-300 underline-offset-4 hover:underline">
                {w.link.href.startsWith("mailto:") && <Mail className="size-3.5" aria-hidden="true" />} {w.link.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
      <SiteFooter />
    </main>
  );
}
