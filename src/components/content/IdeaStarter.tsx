"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles } from "lucide-react";
import { useProjects } from "@/src/components/projects/ProjectsProvider";
import { useIntel } from "@/src/components/intelligence/IntelProvider";
import { emptyStrategyBrief } from "@/src/lib/intelligence/profiles";
import { cx } from "@/src/components/ui/cx";

const EXAMPLES = [
  "A 30-second Short: 3 morning habits that make you more productive. Calm voice, end with a question.",
  "Explain how compound interest works for teenagers, with a simple example and a strong hook.",
  "Top 5 hidden places to visit in Lagos, upbeat and fast-paced.",
];

/** Title from the first sentence of the idea, kept short. */
function titleFrom(text: string): string {
  const first = text.split(/[\n.!?]/).map((s) => s.trim()).find(Boolean) ?? text;
  const clean = first.replace(/^(a|an)\s+\d+[- ]second\s+(short|video)\s*(about|on|:)?\s*/i, "").replace(/^(make|create)\s+(a|an)?\s*(short|video)\s*(about|on|:)?\s*/i, "");
  const t = (clean || first).slice(0, 80).trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * "Describe your video": a creator types a few lines of their own idea; we
 * make a project from it, the script writer completes it, then the video is
 * generated. Same path as a Content Creator idea.
 */
export function IdeaStarter({ className, dark = false }: { className?: string; dark?: boolean }) {
  const router = useRouter();
  const projects = useProjects();
  const intel = useIntel();
  const uid = useId();
  const [text, setText] = useState("");
  const [format, setFormat] = useState<"Short" | "Long">("Short");
  const idea = text.trim();
  const ok = idea.length >= 10;

  function start() {
    if (!ok) return;
    const short = format === "Short";
    const channel = projects.channels[0] ?? projects.addChannel("My channel", "");
    const title = titleFrom(idea);
    const project = projects.create({
      name: title,
      contentType: short ? "Short" : "Long-form video",
      platform: short ? "YouTube Shorts" : "YouTube",
      channelId: channel.id,
      topic: title,
      description: `The creator's idea, in their words:\n${idea}`,
      goal: idea.slice(0, 280),
    });
    intel.saveStrategyFor(project.id, {
      ...emptyStrategyBrief(new Date().toISOString()),
      topic: title,
      angle: `Follow the creator's own idea closely, keep their details and complete the rest: ${idea}`,
      promise: idea.slice(0, 280),
      points: idea,
    });
    intel.saveOutputFor(project.id, "content-idea", idea, "Your idea");
    router.push(`/studio/script?project=${project.id}&autowrite=1`);
  }

  return (
    <section aria-labelledby={`${uid}-h`} className={cx("rounded-2xl border p-4 sm:p-5", dark ? "border-white/15 bg-white/10 text-white" : "border-primary/30 bg-surface", className)}>
      <h2 id={`${uid}-h`} className="flex items-center gap-2 text-base font-semibold">
        <Sparkles className={cx("size-4", dark ? "text-white" : "text-primary")} aria-hidden="true" /> Make a video from your idea
      </h2>
      <p className={cx("mt-1 text-sm", dark ? "text-white/80" : "text-muted-text")}>Type a few lines about the video you want. The AI writes the full script, then makes the video with voice, visuals, music and captions.</p>
      <label className="sr-only" htmlFor={`${uid}-t`}>Your video idea</label>
      <textarea
        id={`${uid}-t`}
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 1500))}
        rows={3}
        placeholder={`e.g. ${EXAMPLES[0]}`}
        className={cx("mt-3 w-full resize-y rounded-xl border px-3.5 py-2.5 text-base outline-none transition focus:border-primary sm:text-sm", dark ? "border-white/20 bg-black/20 text-white placeholder:text-white/50" : "border-border bg-background placeholder:text-muted-text")}
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {EXAMPLES.slice(1).map((e) => (
          <button key={e} type="button" onClick={() => setText(e)} className={cx("rounded-full border px-2.5 py-1 text-left text-xs transition", dark ? "border-white/20 text-white/80 hover:bg-white/10" : "border-border text-muted-text hover:bg-muted hover:text-foreground")}>
            {e.length > 48 ? `${e.slice(0, 46)}…` : e}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Video length" className={cx("inline-flex rounded-full border p-0.5 text-xs font-medium", dark ? "border-white/20" : "border-border")}>
          {(["Short", "Long"] as const).map((f) => (
            <button key={f} type="button" role="radio" aria-checked={format === f} onClick={() => setFormat(f)} className={cx("rounded-full px-3 py-1.5 transition", format === f ? (dark ? "bg-white text-violet-700" : "bg-primary text-primary-foreground") : dark ? "text-white/80" : "text-muted-text")}>
              {f === "Short" ? "Short (vertical)" : "Long video"}
            </button>
          ))}
        </div>
        <button type="button" onClick={start} disabled={!ok} className={cx("inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold transition disabled:opacity-50", dark ? "bg-white text-violet-700" : "bg-gradient-to-r from-fuchsia-600 via-violet-600 to-sky-600 text-white hover:brightness-110")}>
          Write &amp; make my video <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
