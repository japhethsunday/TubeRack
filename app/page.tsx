import Link from "next/link";
import { ArrowRight, Clapperboard, Sparkles, Search, FileText, ImageIcon, Mic, BarChart3 } from "lucide-react";

const FEATURES = [
  { icon: Sparkles, title: "Gemini intelligence", body: "Idea, audience, title, hook, and retention analysis — local checks plus AI reasoning." },
  { icon: Search, title: "Live YouTube research", body: "Search real videos with public view counts and pull them in as references." },
  { icon: FileText, title: "Scripts that write back", body: "Full drafts in your format and tone, section by section, ready to edit." },
  { icon: ImageIcon, title: "Visuals", body: "AI images and on-device drafts, approved and assigned to scenes." },
  { icon: Mic, title: "Voiceovers", body: "Studio-quality narration takes that play straight in the timeline." },
  { icon: BarChart3, title: "Packaging + analytics", body: "Titles, SEO descriptions, tags, and a learning loop after you publish." },
];

/** Public home: what TubeRack does, with real entry points. */
export default function HomePage() {
  return (
    <main id="main" className="relative min-h-screen overflow-hidden bg-[#0b0714] text-white">
      <div className="auth-blob absolute -left-32 -top-32 size-[32rem] rounded-full bg-fuchsia-600/30 blur-3xl" />
      <div className="auth-blob absolute -right-24 top-40 size-[30rem] rounded-full bg-sky-500/25 blur-3xl" style={{ animationDelay: "-7s" }} />
      <div className="auth-grid absolute inset-0" />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-6 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-white text-[#0b0714]">
            <Clapperboard className="size-4" aria-hidden="true" />
          </span>
          <span className="font-semibold tracking-tight">TubeRack</span>
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/login" className="rounded-lg px-3 py-2 font-medium text-white/80 hover:bg-white/10 hover:text-white">
            Sign in
          </Link>
          <Link href="/signup" className="rounded-lg bg-white px-3.5 py-2 font-medium text-[#0b0714] hover:bg-white/90">
            Get started
          </Link>
        </nav>
      </header>

      <section className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
        <p className="auth-rise inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80">
          <Sparkles className="size-3.5 text-fuchsia-300" aria-hidden="true" />
          Powered by Gemini + the YouTube Data API
        </p>
        <h1 className="auth-rise mt-6 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl" style={{ animationDelay: "80ms" }}>
          Your YouTube studio,{" "}
          <span className="bg-gradient-to-r from-fuchsia-300 via-violet-200 to-sky-300 bg-clip-text text-transparent">
            from idea to published.
          </span>
        </h1>
        <p className="auth-rise mt-5 max-w-2xl text-lg leading-relaxed text-white/70" style={{ animationDelay: "160ms" }}>
          Research, script, voice, visuals, packaging, and analytics in one workspace — with AI that
          explains its reasoning and never invents your numbers.
        </p>
        <div className="auth-rise mt-8 flex flex-wrap gap-3" style={{ animationDelay: "240ms" }}>
          <Link
            href="/signup"
            className="auth-sheen group inline-flex h-12 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-[#0b0714] hover:bg-white/90"
          >
            Create free account
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/20 px-5 text-sm font-medium text-white hover:bg-white/10"
          >
            Try without an account
          </Link>
        </div>

        <ul className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <li
              key={f.title}
              className="auth-rise rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm transition-colors hover:bg-white/[0.08]"
              style={{ animationDelay: `${320 + i * 70}ms` }}
            >
              <f.icon className="size-5 text-violet-300" aria-hidden="true" />
              <h2 className="mt-3 font-semibold">{f.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-white/60">{f.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
