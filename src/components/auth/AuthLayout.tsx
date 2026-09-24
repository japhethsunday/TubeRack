"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clapperboard, Sparkles, FileText, Search, Mic, CheckCircle2 } from "lucide-react";
import { AppBackdrop } from "@/src/components/shell/AppBackdrop";

const WORDS = ["scripts", "thumbnails", "voiceovers", "titles", "research", "videos"];
const STAGES = [
  "Idea", "Research", "Strategy", "Script", "Storyboard", "Visuals", "Voice",
  "Music", "Video", "Thumbnail", "SEO", "Repurpose", "Publish", "Analytics",
];

/** Rotating headline word; static for reduced-motion users (CSS handles the rest). */
function RotatingWord() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setIndex((i) => (i + 1) % WORDS.length), 2600);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span className="relative inline-flex h-[1.15em] min-w-[6ch] overflow-hidden align-bottom">
      <span
        key={index}
        className="auth-word bg-gradient-to-r from-fuchsia-300 via-violet-200 to-sky-300 bg-clip-text text-transparent"
      >
        {WORDS[index]}.
      </span>
    </span>
  );
}

function FloatingCard({
  className,
  delay,
  tilt,
  children,
}: {
  className: string;
  delay: string;
  tilt: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`auth-float absolute rounded-2xl border border-white/10 bg-white/[0.07] p-3.5 text-white shadow-2xl shadow-black/40 backdrop-blur-md ${className}`}
      style={{ animationDelay: delay, ["--tilt" as string]: tilt }}
      aria-hidden="true"
    >
      {children}
    </div>
  );
}

/** Animated brand panel: gradient mesh, grid, floating product cards, stage marquee. */
function BrandPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-[#0b0714] lg:flex lg:flex-col lg:justify-between lg:p-12">
      <div className="auth-blob absolute -left-24 -top-24 size-[28rem] rounded-full bg-fuchsia-600/40 blur-3xl" />
      <div className="auth-blob absolute -bottom-32 -right-16 size-[30rem] rounded-full bg-sky-500/30 blur-3xl" style={{ animationDelay: "-6s" }} />
      <div className="auth-blob absolute left-1/3 top-1/3 size-72 rounded-full bg-violet-600/40 blur-3xl" style={{ animationDelay: "-12s" }} />
      <div className="auth-grid absolute inset-0" />

      <Link href="/" aria-label="TubeRack home" className="relative flex items-center gap-2 text-white">
        <span className="flex size-9 items-center justify-center rounded-xl bg-white text-[#0b0714]">
          <Clapperboard className="size-4" aria-hidden="true" />
        </span>
        <span className="text-base font-semibold tracking-tight">TubeRack</span>
      </Link>

      <div className="relative h-80">
        <FloatingCard className="left-0 top-2 w-64" delay="0s" tilt="-3deg">
          <p className="flex items-center gap-2 text-xs font-medium text-white/70">
            <Sparkles className="size-3.5 text-fuchsia-300" /> Video analysis
          </p>
          <p className="mt-1.5 text-sm leading-snug">Lead with the payoff — your hook buries the result 12s in.</p>
        </FloatingCard>
        <FloatingCard className="right-4 top-20 w-56" delay="-2s" tilt="4deg">
          <p className="flex items-center gap-2 text-xs font-medium text-white/70">
            <FileText className="size-3.5 text-sky-300" /> Script draft
          </p>
          <p className="mt-1.5 text-sm">9 sections · 1,240 words</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="auth-progress h-full rounded-full bg-gradient-to-r from-sky-400 to-violet-400" />
          </div>
        </FloatingCard>
        <FloatingCard className="bottom-6 left-10 w-60" delay="-4s" tilt="2deg">
          <p className="flex items-center gap-2 text-xs font-medium text-white/70">
            <Search className="size-3.5 text-emerald-300" /> YouTube research
          </p>
          <p className="mt-1.5 text-sm">12 live results · real view counts</p>
        </FloatingCard>
        <FloatingCard className="bottom-0 right-0 w-44" delay="-1s" tilt="-5deg">
          <p className="flex items-center gap-2 text-xs font-medium text-white/70">
            <Mic className="size-3.5 text-amber-300" /> Voiceover
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm">
            <CheckCircle2 className="size-3.5 text-emerald-300" /> Take ready
          </p>
        </FloatingCard>
      </div>

      <div className="relative space-y-6 text-white">
        <h2 className="text-4xl font-semibold leading-[1.1] tracking-tight">
          Make better <RotatingWord />
          <br />
          <span className="text-white/60">From idea to published.</span>
        </h2>
        <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_15%,black_85%,transparent)]">
          <ul className="auth-marquee flex w-max gap-2" aria-label="Production pipeline">
            {[...STAGES, ...STAGES].map((s, i) => (
              <li key={`${s}-${i}`} className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80">
                {s}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** Split-screen auth layout: animated brand panel + staged form card. */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main id="main" className="relative grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <AppBackdrop />
      <BrandPanel />
      <div className="relative flex items-center justify-center overflow-hidden px-4 py-12 sm:px-8">
        <div className="relative w-full max-w-md">
          <Link href="/" aria-label="TubeRack home" className="auth-rise flex items-center gap-2 lg:hidden">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Clapperboard className="size-4" aria-hidden="true" />
            </span>
            <span className="text-base font-semibold tracking-tight">TubeRack</span>
          </Link>
          <h1 className="auth-rise mt-8 text-3xl font-semibold tracking-tight lg:mt-0" style={{ animationDelay: "60ms" }}>
            {title}
          </h1>
          <p className="auth-rise mt-1.5 text-sm text-muted-text" style={{ animationDelay: "120ms" }}>
            {subtitle}
          </p>
          <div
            className="auth-rise mt-7 rounded-2xl border border-border bg-surface p-6 shadow-xl shadow-violet-900/[0.08] backdrop-blur-xl sm:p-7"
            style={{ animationDelay: "180ms" }}
          >
            {children}
          </div>
          {footer && (
            <div className="auth-rise mt-5 text-center text-sm text-muted-text" style={{ animationDelay: "260ms" }}>
              {footer}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
