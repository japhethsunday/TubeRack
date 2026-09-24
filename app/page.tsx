import Link from "next/link";
import {
  ArrowRight, Clapperboard, Sparkles, Search, FileText, ImageIcon, Mic, BarChart3,
  Lightbulb, Wand2, Rocket, Music, Captions, Layers,
} from "lucide-react";
import { HeroMockup } from "@/src/components/home/HeroMockup";
import { SiteHeader } from "@/src/components/home/SiteHeader";
import { SiteFooter } from "@/src/components/home/SiteFooter";
import { Reveal, CountUp } from "@/src/components/home/motion";

const FEATURES = [
  { icon: Sparkles, title: "Content intelligence", body: "Idea, audience, title, hook, and retention analysis, scored against real YouTube data." },
  { icon: Search, title: "Live YouTube research", body: "Search real videos with public view counts and pull them in as references." },
  { icon: FileText, title: "Scripts that write back", body: "Full drafts in your format and tone, section by section, ready to edit." },
  { icon: ImageIcon, title: "Visuals", body: "Generated images and on-device drafts, approved and assigned to scenes." },
  { icon: Mic, title: "Voiceovers", body: "Studio-quality narration takes that play straight in the timeline." },
  { icon: BarChart3, title: "Packaging + analytics", body: "Titles, SEO descriptions, tags, and live YouTube stats after you publish." },
];

const STAGES = [
  "Idea", "Research", "Strategy", "Script", "Storyboard", "Visuals", "Voice", "Music",
  "Video", "Thumbnail", "SEO", "Repurpose", "Publish", "Analytics", "Improve",
];

const STEPS = [
  { icon: Lightbulb, title: "Drop in an idea", body: "Idea Lab scores the angle, the audience, and the hook before you spend an hour on it." },
  { icon: Wand2, title: "Produce in one place", body: "Script, storyboard, voice, visuals, and timeline share one project — nothing to copy between tools." },
  { icon: Rocket, title: "Package and learn", body: "Titles, SEO, thumbnails, then real YouTube stats feed your next idea." },
];

const ORBIT = [
  { label: "Intelligence", className: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2" },
  { label: "YouTube API", className: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2" },
  { label: "Supabase", className: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2" },
  { label: "Resend", className: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2" },
];
const ORBIT_INNER = [
  { label: "Scripts", className: "left-[15%] top-[15%]" },
  { label: "Voice", className: "right-[15%] top-[15%]" },
  { label: "Images", className: "bottom-[15%] right-[15%]" },
  { label: "Captions", className: "bottom-[15%] left-[15%]" },
];

const MARQUEE = [
  "Hook analysis", "Audience profiles", "Retention risks", "Content gaps", "YouTube search",
  "Script drafts", "Section rewrites", "Storyboards", "Scene images", "Narration", "Music beds",
  "Timeline", "Captions", "Title options", "SEO descriptions", "Repurposing", "Live stats",
];

/** Public home: what TubeRack does, with real entry points. */
export default function HomePage() {
  return (
    <main id="main" className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="auth-blob pointer-events-none absolute -left-32 -top-32 size-[32rem] rounded-full bg-fuchsia-400/20 blur-3xl dark:bg-fuchsia-600/30" />
      <div className="auth-blob pointer-events-none absolute -right-24 top-40 size-[30rem] rounded-full bg-sky-400/20 blur-3xl dark:bg-sky-500/25" style={{ animationDelay: "-7s" }} />
      <div className="auth-blob pointer-events-none absolute left-1/3 top-[70rem] size-[36rem] rounded-full bg-violet-400/20 blur-3xl dark:bg-violet-600/20" style={{ animationDelay: "-11s" }} />
      <div className="app-grid pointer-events-none absolute inset-x-0 top-0 h-[60rem]" />

      <SiteHeader />

      {/* Hero */}
      <section className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
        <div>
          <p className="auth-rise inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-foreground/5 px-3 py-1 text-xs text-foreground/80">
            <span className="relative flex size-2">
              <span className="home-pulse-ring absolute inline-flex size-full rounded-full bg-emerald-400" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            Built on the YouTube Data API
          </p>
          <h1 className="auth-rise mt-6 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl" style={{ animationDelay: "80ms" }}>
            Your YouTube studio,{" "}
            <span className="bg-gradient-to-r from-fuchsia-600 via-violet-600 to-sky-600 dark:from-fuchsia-300 dark:via-violet-200 dark:to-sky-300 bg-clip-text text-transparent">
              from idea to published.
            </span>
          </h1>
          <p className="auth-rise mt-5 max-w-xl text-lg leading-relaxed text-foreground/70" style={{ animationDelay: "160ms" }}>
            Research, script, voice, visuals, packaging, and analytics in one workspace.
            Every number comes from real YouTube data.
          </p>
          <div className="auth-rise mt-8 flex flex-wrap gap-3" style={{ animationDelay: "240ms" }}>
            <Link href="/signup" className="auth-sheen group inline-flex h-12 items-center gap-2 rounded-xl bg-foreground px-5 text-sm font-semibold text-background hover:bg-foreground/90">
              Create free account
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </Link>
            <Link href="/dashboard" className="inline-flex h-12 items-center gap-2 rounded-xl border border-foreground/20 px-5 text-sm font-medium text-foreground hover:bg-foreground/10">
              Try without an account
            </Link>
          </div>
        </div>
        <div className="auth-rise" style={{ animationDelay: "300ms" }}>
          <HeroMockup />
        </div>
      </section>

      {/* Capability marquee */}
      <div className="relative z-10 border-y border-foreground/10 bg-foreground/[0.02] py-4 [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
        <ul className="auth-marquee flex w-max gap-3" aria-label="Capabilities">
          {[...MARQUEE, ...MARQUEE].map((m, i) => (
            <li key={`${m}-${i}`} className="flex items-center gap-3 whitespace-nowrap text-sm text-foreground/60">
              <Sparkles className="size-3.5 text-violet-600 dark:text-violet-300" aria-hidden="true" />
              {m}
            </li>
          ))}
        </ul>
      </div>

      {/* Facts (real product numbers) */}
      <section className="relative z-10 mx-auto grid max-w-6xl grid-cols-2 gap-4 px-4 py-16 sm:px-6 lg:grid-cols-4">
        {[
          { n: 15, label: "pipeline stages, one project" },
          { n: 8, label: "intelligence studios" },
          { n: 5, label: "production studios" },
          { n: 10, label: "analysis tools" },
        ].map((f, i) => (
          <Reveal key={f.label} delay={i * 90}>
            <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-5 text-center">
              <p className="bg-gradient-to-b from-foreground to-violet-500 dark:to-violet-300 bg-clip-text text-4xl font-semibold text-transparent">
                <CountUp to={f.n} />
              </p>
              <p className="mt-1 text-sm text-foreground/60">{f.label}</p>
            </div>
          </Reveal>
        ))}
      </section>

      {/* Pipeline */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <Reveal>
          <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">One pipeline. Every stage connected.</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-foreground/60">Each stage opens its own studio, and everything you approve flows into the next one.</p>
        </Reveal>
        <ol className="mt-10 flex flex-wrap justify-center gap-2.5">
          {STAGES.map((s, i) => (
            <li key={s}>
              <Reveal delay={i * 45}>
                <span className="group inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-foreground/[0.04] px-4 py-2 text-sm text-foreground/80 transition-all duration-300 hover:-translate-y-0.5 hover:border-violet-300/50 hover:bg-violet-500/15 hover:text-foreground">
                  <span className="text-xs tabular-nums text-violet-600/80 dark:text-violet-300/80">{String(i + 1).padStart(2, "0")}</span>
                  {s}
                </span>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      {/* How it works + orbit */}
      <section id="how" className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-4 pb-24 sm:px-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">How it works</h2>
          </Reveal>
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 120}>
              <div className="flex gap-4 rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-5 transition-colors hover:bg-foreground/[0.06]">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white shadow-lg shadow-violet-900/30 dark:shadow-violet-900/50">
                  <s.icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-semibold">
                    <span className="mr-2 text-violet-600 dark:text-violet-300">{i + 1}.</span>
                    {s.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-foreground/60">{s.body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={150}>
          <div className="relative mx-auto aspect-square w-full max-w-md" aria-label="Providers TubeRack connects to">
            <div className="home-orbit absolute inset-0 rounded-full border border-dashed border-foreground/15">
              {ORBIT.map((o) => (
                <span key={o.label} className={`absolute ${o.className} rounded-full border border-foreground/15 bg-elevated px-3 py-1 text-xs text-foreground/80 shadow-lg`}>
                  {o.label}
                </span>
              ))}
            </div>
            <div className="home-orbit-rev absolute inset-[18%] rounded-full border border-dashed border-violet-300/20">
              {ORBIT_INNER.map((o) => (
                <span key={o.label} className={`absolute ${o.className} rounded-full border border-violet-300/20 bg-violet-500/10 px-2.5 py-0.5 text-[11px] text-violet-700 dark:text-violet-100`}>
                  {o.label}
                </span>
              ))}
            </div>
            <div className="absolute inset-[38%] flex items-center justify-center rounded-3xl bg-gradient-to-br from-fuchsia-500 via-violet-600 to-sky-500 text-white shadow-2xl shadow-violet-700/30 dark:shadow-violet-700/50">
              <Clapperboard className="size-10" aria-hidden="true" />
            </div>
          </div>
        </Reveal>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <Reveal>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Everything a channel needs</h2>
        </Reveal>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <li key={f.title}>
              <Reveal delay={i * 80}>
                <div className="group relative h-full rounded-2xl p-px">
                  <div className="home-glow-border absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                  <div className="relative h-full rounded-2xl border border-foreground/10 bg-surface p-5 transition-transform duration-300 group-hover:-translate-y-1">
                    <f.icon className="size-5 text-violet-600 dark:text-violet-300 transition-transform duration-300 group-hover:scale-110" aria-hidden="true" />
                    <h3 className="mt-3 font-semibold">{f.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-foreground/60">{f.body}</p>
                  </div>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
        <Reveal delay={200}>
          <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-foreground/50">
            {[{ icon: Music, t: "Music beds" }, { icon: Captions, t: "Captions from your voiceover" }, { icon: Layers, t: "Multi-track timeline" }].map((x) => (
              <span key={x.t} className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 px-3 py-1">
                <x.icon className="size-3.5" aria-hidden="true" />
                {x.t}
              </span>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Final CTA */}
      <section className="relative z-10 mx-auto max-w-4xl px-4 pb-24 sm:px-6">
        <Reveal>
          <div className="relative rounded-3xl p-px">
            <div className="home-glow-border absolute inset-0 rounded-3xl" />
            <div className="relative overflow-hidden rounded-3xl bg-surface px-6 py-14 text-center">
              <div className="auth-blob absolute -right-20 -top-20 size-64 rounded-full bg-fuchsia-400/20 blur-3xl dark:bg-fuchsia-600/30" />
              <h2 className="relative text-3xl font-semibold tracking-tight sm:text-4xl">Make your next video better than your last.</h2>
              <p className="relative mx-auto mt-3 max-w-xl text-foreground/60">Free to start. Your projects sync to your account across devices.</p>
              <Link href="/signup" className="auth-sheen group relative mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-foreground px-6 text-sm font-semibold text-background hover:bg-foreground/90">
                Get started free
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      <SiteFooter />
    </main>
  );
}
