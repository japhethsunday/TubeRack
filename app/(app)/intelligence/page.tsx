"use client";

import Link from "next/link";
import { Suspense } from "react";
import { Lightbulb, ArrowRight, Check, X } from "lucide-react";
import { useIntel } from "@/src/components/intelligence/IntelProvider";
import { useProjects, LocalStorageNote } from "@/src/components/projects/ProjectsProvider";
import { useChannelPicker } from "@/src/components/intelligence/chrome";
import { DnaEditor } from "@/src/components/intelligence/DnaEditor";
import { INTELLIGENCE_TASK_DEFS, INTELLIGENCE_TASKS } from "@/src/lib/intelligence/tasks";
import { EmptyState } from "@/src/components/ui/states";
import { Badge } from "@/src/components/ui/Badge";
import { LoadingState } from "@/src/components/ui/feedback";

export default function IntelligenceHubPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading intelligence" />}>
      <Hub />
    </Suspense>
  );
}

function Hub() {
  const { ready, opportunities, setOpportunityStatus } = useIntel();
  const { ready: projectsReady } = useProjects();
  const channel = useChannelPicker();

  if (!ready || !projectsReady) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <LoadingState label="Loading intelligence" />
      </div>
    );
  }

  const candidates = opportunities.filter((o) => o.status === "candidate");

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-text">
            Decide what to make — and why
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Content Intelligence
          </h1>
          <p className="mt-1 max-w-prose text-sm text-muted-text">
            Local heuristic analysis over your input — structured, editable, and
            honest about its limits. Provider reasoning connects in Phase 11.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {channel.picker}
          <Link
            href="/intelligence/lab"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Lightbulb className="size-4" aria-hidden="true" />
            Open Idea Lab
          </Link>
        </div>
      </div>

      <section aria-label="Intelligence tasks">
        <h2 className="text-sm font-semibold">Start with a task</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {INTELLIGENCE_TASKS.map((t) => {
            const def = INTELLIGENCE_TASK_DEFS[t];
            return (
              <li key={t}>
                <Link
                  href={def.route}
                  className="block h-full rounded-xl border border-border bg-surface p-4 transition-colors duration-150 hover:border-muted-text/50 hover:bg-muted/40"
                >
                  <span className="flex items-center justify-between gap-2 text-sm font-medium">
                    {def.label}
                    <ArrowRight className="size-4 shrink-0 text-muted-text" aria-hidden="true" />
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-text">{def.blurb}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label="Content opportunities">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Content opportunities ({candidates.length})</h2>
          <Badge tone="preview">Saved locally</Badge>
        </div>
        {opportunities.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon={Lightbulb}
              title="No opportunities saved"
              body="Analyze an idea in the Idea Lab, then save the angles worth pursuing. Opportunities carry reasoning — never fabricated metrics."
              action={
                <Link
                  href="/intelligence/lab"
                  className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  Analyze an idea
                </Link>
              }
            />
          </div>
        ) : (
          <ul className="mt-3 grid gap-3 lg:grid-cols-2" aria-label="Saved opportunities">
            {opportunities.slice(0, 6).map((o) => (
              <li key={o.id} className="rounded-xl border border-border bg-surface p-4">
                <p className="flex items-center justify-between gap-2 text-sm font-medium">
                  <span className="truncate">{o.title}</span>
                  <Badge tone={o.status === "chosen" ? "ok" : o.status === "dismissed" ? "neutral" : "info"}>
                    {o.status}
                  </Badge>
                </p>
                <p className="mt-1 text-xs text-muted-text">
                  {o.angle} · {o.audience || "audience TBD"} · via {o.sourceTask}
                </p>
                <p className="mt-2 line-clamp-2 text-sm text-muted-text">{o.reasoning}</p>
                {o.status === "candidate" && (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setOpportunityStatus(o.id, "chosen")}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-muted"
                    >
                      <Check className="size-3.5" aria-hidden="true" />
                      Choose
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpportunityStatus(o.id, "dismissed")}
                      className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-muted-text hover:bg-muted"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                      Dismiss
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Channel DNA" id="dna">
        <h2 className="text-sm font-semibold">Channel DNA</h2>
        <p className="mt-0.5 text-xs text-muted-text">
          Defined once per channel, consumed by every analysis. No duplication across features.
        </p>
        <div className="mt-3">
          <DnaEditor key={channel.channelId} channelId={channel.channelId} channelName={channel.channelName} />
        </div>
      </section>

      <LocalStorageNote compact />
    </div>
  );
}
