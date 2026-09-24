"use client";

import Link from "next/link";
import { ArrowRight, ArrowUp, Clapperboard, Sparkles } from "lucide-react";
import { Reveal } from "@/src/components/home/motion";

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Studios",
    links: [
      { href: "/studio/script", label: "Script Studio" },
      { href: "/studio/storyboard", label: "Storyboard" },
      { href: "/studio/media", label: "Media Studio" },
      { href: "/studio/video", label: "Video Studio" },
      { href: "/studio/package", label: "Packaging & SEO" },
    ],
  },
  {
    title: "Intelligence",
    links: [
      { href: "/intelligence", label: "Content Intelligence" },
      { href: "/intelligence/lab", label: "Idea Lab" },
      { href: "/intelligence/research", label: "YouTube research" },
      { href: "/intelligence/gaps", label: "Content gaps" },
      { href: "/analytics", label: "Analytics" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/signup", label: "Create account" },
      { href: "/login", label: "Sign in" },
      { href: "/forgot-password", label: "Reset password" },
      { href: "/settings", label: "Settings" },
      { href: "/dashboard", label: "Dashboard" },
    ],
  },
];

function FooterLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-1.5 text-sm text-foreground/60 hover:text-foreground">
      <span className="relative">
        {label}
        <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-gradient-to-r from-fuchsia-500 to-sky-400 transition-[width] duration-300 ease-out group-hover:w-full" />
      </span>
      <ArrowRight className="size-3 -translate-x-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" aria-hidden="true" />
    </Link>
  );
}

/** Marketing footer: brand, real destinations, stack line, back-to-top. */
export function SiteFooter() {
  return (
    <footer className="relative z-10 mt-8">
      <div className="home-glow-border h-px w-full opacity-70" aria-hidden="true" />
      <div className="bg-foreground/[0.02]">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <Reveal>
            <div className="space-y-4">
              <Link href="/" className="group inline-flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 via-violet-600 to-sky-500 text-white shadow-lg shadow-violet-900/30 transition-transform duration-500 group-hover:rotate-[-8deg] group-hover:scale-105">
                  <Clapperboard className="size-4" aria-hidden="true" />
                </span>
                <span className="font-semibold tracking-tight">TubeRack</span>
              </Link>
              <p className="max-w-xs text-sm leading-relaxed text-foreground/60">
                Research, script, voice, visuals, packaging, and analytics for YouTube creators — in one workspace.
              </p>
              <Link
                href="/signup"
                className="auth-sheen group inline-flex h-10 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-semibold text-background hover:bg-foreground/90"
              >
                Get started free
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </Link>
            </div>
          </Reveal>
          {COLUMNS.map((col, i) => (
            <Reveal key={col.title} delay={120 + i * 90}>
              <nav aria-label={col.title}>
                <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/50">{col.title}</h3>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <FooterLink {...l} />
                    </li>
                  ))}
                </ul>
              </nav>
            </Reveal>
          ))}
        </div>
        <div className="border-t border-foreground/10">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-xs text-foreground/50 sm:px-6">
            <p>© {new Date().getFullYear()} TubeRack. All rights reserved.</p>
            <p className="inline-flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-violet-500 dark:text-violet-300" aria-hidden="true" />
              Built on the YouTube Data API
            </p>
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="group inline-flex items-center gap-1.5 rounded-full border border-foreground/15 px-3 py-1.5 text-foreground/70 hover:border-violet-400/50 hover:text-foreground"
            >
              Back to top
              <ArrowUp className="size-3.5 transition-transform duration-300 group-hover:-translate-y-0.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
