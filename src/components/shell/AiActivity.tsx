"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { subscribeAiActivity, type AiTask } from "@/src/lib/api";

/**
 * A small notice at the top of every page while AI is working, so people
 * know to wait and keep the page open. Leaving the page asks first.
 */
export function AiActivity() {
  const [tasks, setTasks] = useState<AiTask[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => subscribeAiActivity(setTasks), []);

  const busy = tasks.length > 0;
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      clearInterval(t);
      window.removeEventListener("beforeunload", warn);
    };
  }, [busy]);

  // Quick calls finish before the notice would flash on screen.
  const shown = tasks.filter((t) => now - t.startedAt > 600);
  if (!shown.length) return null;
  const oldest = shown[0];
  const secs = Math.max(0, Math.round((now - oldest.startedAt) / 1000));

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[calc(4.25rem+env(safe-area-inset-top))] z-50 flex justify-center px-4 lg:top-[4.5rem]"
    >
      <div className="pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-full border border-primary/30 bg-surface/95 py-1.5 pl-2 pr-4 text-sm shadow-lg backdrop-blur">
        <span className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" aria-hidden="true" />
          <Sparkles className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium">
            {oldest.label}…{shown.length > 1 ? ` (+${shown.length - 1} more)` : ""}
          </span>
          <span className="block truncate text-xs text-muted-text">AI is working · {secs}s · keep this page open</span>
        </span>
      </div>
    </div>
  );
}
