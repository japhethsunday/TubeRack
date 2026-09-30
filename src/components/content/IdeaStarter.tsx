"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, MonitorPlay, Smartphone, Sparkles, Wand2 } from "lucide-react";
import { useProjects } from "@/src/components/projects/ProjectsProvider";
import { useIntel } from "@/src/components/intelligence/IntelProvider";
import { emptyStrategyBrief } from "@/src/lib/intelligence/profiles";
import { cx } from "@/src/components/ui/cx";

const MAX = 1500;
const DRAFT_KEY = "recktube:idea-draft";

function readDraft(): string {
  try {
    return (localStorage.getItem(DRAFT_KEY) ?? "").slice(0, MAX);
  } catch {
    return "";
  }
}

function writeDraft(v: string) {
  try {
    if (v) localStorage.setItem(DRAFT_KEY, v);
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Private mode or storage full: the box still works, it just won't survive a reload.
  }
}

const EXAMPLES = [
  { label: "Morning habits", text: "A 30-second Short: 3 morning habits that make you more productive. Calm voice, end with a question." },
  { label: "Money tips", text: "3 simple ways students can save money every month. Friendly tone, practical examples, end with a question." },
  { label: "Travel guide", text: "Top 5 hidden places to visit in Lagos. Upbeat and fast-paced, a quick fact for each place." },
  { label: "Explain a topic", text: "Explain how compound interest works for teenagers, with one simple example and a strong hook." },
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
export function IdeaStarter({ className }: { className?: string }) {
  const router = useRouter();
  const projects = useProjects();
  const intel = useIntel();
  const uid = useId();
  const [text, setTextState] = useState("");
  const [format, setFormat] = useState<"Short" | "Long">("Short");
  const idea = text.trim();
  const ok = idea.length >= 10;

  // Restore after mount so server and client render the same first frame.
  useEffect(() => {
    const saved = readDraft();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore of the saved draft.
    if (saved) setTextState(saved);
  }, []);

  function setText(v: string) {
    setTextState(v);
    writeDraft(v);
  }

  function start() {
    if (!ok) return;
    writeDraft("");
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
    <section aria-labelledby={`${uid}-h`} className={cx("rounded-[1.4rem] bg-gradient-to-br from-fuchsia-500/60 via-violet-500/50 to-sky-500/60 p-px shadow-lg shadow-violet-900/10", className)}>
      <div className="rounded-[calc(1.4rem-1px)] bg-surface p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-600 via-violet-600 to-sky-600 text-white shadow-md shadow-violet-900/20">
            <Wand2 className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id={`${uid}-h`} className="text-base font-semibold tracking-tight sm:text-lg">Make a video from your idea</h2>
            <p className="mt-0.5 text-[13px] leading-snug text-muted-text sm:text-sm">Describe it in a few lines. We write the script and make the video.</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-background/70 transition focus-within:border-violet-400/70 focus-within:shadow-[0_0_0_4px_rgba(139,92,246,0.12)]">
          <label className="sr-only" htmlFor={`${uid}-t`}>Your video idea</label>
          <textarea
            id={`${uid}-t`}
            value={text}
            onChange={(e) => {
              setText(e.target.value.slice(0, MAX));
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 220)}px`;
            }}
            rows={3}
            enterKeyHint="go"
            placeholder="What's your video about? e.g. 3 morning habits that make you more productive. Calm voice, end with a question."
            style={{ outline: "none", boxShadow: "none" }}
            className="block min-h-[96px] w-full resize-none border-0 bg-transparent px-4 pt-3.5 text-base leading-relaxed text-foreground outline-none placeholder:text-muted-text/80 sm:text-[15px]"
          />
          <div className="flex items-center justify-between gap-2 border-t border-border/70 px-2 py-2">
            <div role="radiogroup" aria-label="Video format" className="inline-flex rounded-xl bg-muted/70 p-0.5 text-xs font-medium">
              {([["Short", "Short", Smartphone], ["Long", "Long video", MonitorPlay]] as const).map(([f, label, Icon]) => (
                <button key={f} type="button" role="radio" aria-checked={format === f} onClick={() => setFormat(f)} className={cx("inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 transition", format === f ? "bg-surface text-foreground shadow-sm" : "text-muted-text hover:text-foreground")}>
                  <Icon className="size-3.5" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
            <span className={cx("pr-2 text-[11px] tabular-nums", text.length > MAX - 100 ? "text-amber-600" : "text-muted-text/70")} aria-live="polite">
              {text.length ? `${text.length}/${MAX}` : ""}
            </span>
          </div>
        </div>

        {!text && (
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
            <span className="shrink-0 self-center text-xs font-medium text-muted-text">Try:</span>
            {EXAMPLES.map((e) => (
              <button key={e.label} type="button" onClick={() => setText(e.text)} className="shrink-0 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground/80 transition hover:border-violet-400/50 hover:bg-violet-500/5 hover:text-foreground">
                {e.label}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex flex-wrap items-center justify-center gap-x-1.5 text-[11px] text-muted-text sm:justify-start">
            {["Script", "Voice", "Visuals", "Music", "Captions"].map((step, i) => (
              <span key={step} className="inline-flex items-center gap-1.5">
                {i > 0 && <span aria-hidden="true" className="text-muted-text/50">·</span>}
                {step}
              </span>
            ))}
          </p>
          <button type="button" onClick={start} disabled={!ok} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-600 via-violet-600 to-sky-600 px-6 text-[15px] font-semibold text-white shadow-lg shadow-violet-900/20 transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none sm:h-11 sm:w-auto sm:rounded-xl sm:text-sm">
            <Sparkles className="size-4" aria-hidden="true" />
            Write &amp; make my video
            <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
