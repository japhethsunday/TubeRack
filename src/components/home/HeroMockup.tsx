import { Sparkles, FileText, Mic, Film, Search, Image as ImageIcon } from "lucide-react";
import { Typewriter } from "@/src/components/home/motion";

const BARS = Array.from({ length: 28 }, (_, i) => i);

/** Animated product window: AI script writing, voice waveform, timeline. */
export function HeroMockup() {
  return (
    <div className="relative mx-auto w-full max-w-xl" aria-hidden="true">
      <div className="home-glow-border absolute -inset-px rounded-3xl opacity-60 blur-sm" />
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#120c1f]/90 shadow-2xl shadow-violet-900/40 backdrop-blur-xl">
        <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
          <span className="size-2.5 rounded-full bg-rose-400/80" />
          <span className="size-2.5 rounded-full bg-amber-300/80" />
          <span className="size-2.5 rounded-full bg-emerald-400/80" />
          <span className="ml-3 text-xs text-white/50">Script Studio — “Fix your hook”</span>
        </div>
        <div className="grid grid-cols-[3rem_1fr]">
          <div className="flex flex-col items-center gap-4 border-r border-white/10 py-4 text-white/40">
            {[Search, FileText, ImageIcon, Mic, Film].map((Icon, i) => (
              <Icon key={i} className={`size-4 ${i === 1 ? "text-violet-300" : ""}`} />
            ))}
          </div>
          <div className="space-y-3 p-4">
            <div className="rounded-xl border border-violet-400/20 bg-violet-500/10 p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-violet-200">
                <Sparkles className="size-3" /> Writing draft
              </p>
              <Typewriter />
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-white/60">
                <Mic className="size-3 text-amber-300" /> Voiceover take
              </p>
              <div className="flex h-10 items-end gap-[3px]">
                {BARS.map((i) => (
                  <span
                    key={i}
                    className="home-bar w-full rounded-sm bg-gradient-to-t from-violet-500 to-sky-300"
                    style={{ animationDelay: `${(i * 97) % 900}ms`, height: `${30 + ((i * 37) % 70)}%` }}
                  />
                ))}
              </div>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-white/60">
                <Film className="size-3 text-sky-300" /> Timeline
              </p>
              <div className="space-y-1.5">
                <div className="flex gap-1">
                  <span className="h-3 w-1/4 rounded bg-fuchsia-400/60" />
                  <span className="h-3 w-1/3 rounded bg-violet-400/60" />
                  <span className="h-3 w-1/5 rounded bg-sky-400/60" />
                </div>
                <div className="flex gap-1">
                  <span className="h-3 w-2/3 rounded bg-amber-300/50" />
                  <span className="h-3 w-1/4 rounded bg-emerald-400/50" />
                </div>
              </div>
              <span className="home-scan absolute inset-y-0 left-0 w-0.5 bg-white/80 shadow-[0_0_12px_rgba(255,255,255,0.8)]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
