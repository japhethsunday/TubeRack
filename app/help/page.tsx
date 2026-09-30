import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/src/components/home/SiteHeader";
import { SiteFooter } from "@/src/components/home/SiteFooter";
import { HelpSearch } from "@/src/components/home/HelpSearch";

export const metadata: Metadata = {
  title: "Help Center · Recktube",
  description: "Guides for making, exporting and publishing videos with Recktube: YouTube, TikTok, credits, account and privacy.",
  alternates: { canonical: "/help" },
};

export default function HelpCenter() {
  return (
    <main id="main" className="relative min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400">Help Center</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">How can we help?</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/70">
          Short guides for everything in Recktube. Signed in? The support chat (bottom-right in the app) can also check your account and answer in seconds.
        </p>
        <HelpSearch />
        <div className="mt-12 rounded-3xl border border-foreground/10 bg-foreground/[0.02] p-6 text-sm">
          <p className="font-semibold">Still need help?</p>
          <p className="mt-1 text-foreground/70">
            Email <a href="mailto:support@recktube.xyz" className="underline">support@recktube.xyz</a> or see all the ways to <Link href="/contact" className="underline">contact us</Link>.
          </p>
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
