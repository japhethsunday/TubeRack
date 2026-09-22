"use client";

import { Suspense, useState } from "react";
import { useIntel } from "@/src/components/intelligence/IntelProvider";
import { useProjects } from "@/src/components/projects/ProjectsProvider";
import { ProjectAttach, UsageNote, useIntelQuery } from "@/src/components/intelligence/chrome";
import { TaskRunner } from "@/src/components/intelligence/TaskRunner";
import { SavedItems } from "@/src/components/intelligence/SavedItems";
import { MethodologyNote, OutputSection } from "@/src/components/intelligence/output";
import { detectWeakOpenings, hookFrameworks, classifyHook } from "@/src/lib/intelligence/hooks";
import { Textarea, Input } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";
import { LoadingState } from "@/src/components/ui/feedback";
import { Breadcrumb } from "@/src/components/ui/data";
import { LocalStorageNote } from "@/src/components/projects/ProjectsProvider";

const HOOK_METHODOLOGY =
  "Local pattern checks (no AI, no predictions). Openings are scanned for greeting filler, meta announcements, " +
  "apologies, throat-clearing, vague promises, and premature promo. Frameworks are fixed rhetorical structures — " +
  "you supply the substance.";

export default function HooksPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading hook intelligence" />}>
      <HooksBody />
    </Suspense>
  );
}

function HooksBody() {
  const { projects } = useProjects();
  const { intelFor, addHook, setItemStatus, editItem } = useIntel();
  const { projectId: linkedProject } = useIntelQuery();
  const [projectId, setProjectId] = useState<string | null>(linkedProject);
  const [topic, setTopic] = useState("");
  const [opening, setOpening] = useState("");
  const [draft, setDraft] = useState("");

  const project = projects.find((p) => p.id === projectId);
  const intel = projectId ? intelFor(projectId) : null;
  const liveClass = draft.trim() ? classifyHook(draft) : null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Breadcrumb trail={[{ label: "Content Intelligence", href: "/intelligence" }, { label: "Hooks" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Hook intelligence</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-text">
          Kill weak openings with real detection, then build on nine hook
          frameworks. Every hook explains its intended reaction and what must
          follow it.
        </p>
      </div>

      <ProjectAttach projectId={projectId} onChange={setProjectId} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
          <Input label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Payoff-first openings" />
          <Textarea label="Your opening lines (paste first ~40 words)" rows={4} value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="Hey guys, welcome back to the channel. In this video…" />
          <TaskRunner
            task="hook-analysis"
            contextSummary={opening ? `${opening.split(/\s+/).length} opening words` : "no opening pasted"}
            idleHint="Scans your opening for the six weak patterns and prescribes fixes."
            work={() => detectWeakOpenings(opening)}
            onCompleted={() => {}}
          >
            {(result) =>
              result && (
                <div className="space-y-2">
                  {result.length === 0 ? (
                    <p role="status" className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm">
                      No weak patterns detected in the opening. Read it aloud — if it takes two breaths, still cut it in half.
                    </p>
                  ) : (
                    <ul className="space-y-1.5" aria-label="Weak openings found">
                      {result.map((w) => (
                        <li key={w.label} className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                          <p className="flex items-center justify-between gap-2 font-medium">
                            {w.label}
                            <Badge tone="warn">Fix</Badge>
                          </p>
                          <p className="mt-0.5 text-muted-text">{w.suggestion}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                  <MethodologyNote text={HOOK_METHODOLOGY} />
                </div>
              )
            }
          </TaskRunner>
          <UsageNote kind="text" taskLabel="hook-analysis" />
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold">Classify a draft hook</h2>
            <div className="mt-2 flex gap-2">
              <div className="flex-1">
                <Input label="Draft hook" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Why does this fail for beginners?" />
              </div>
            </div>
            {liveClass && (
              <p className="mt-2 text-sm" aria-live="polite">
                Reads as: <Badge tone="info">{liveClass}</Badge>
              </p>
            )}
          </div>
          <h2 className="text-sm font-semibold">Nine hook frameworks</h2>
          <ul className="space-y-2" aria-label="Hook frameworks">
            {hookFrameworks(topic).map((f) => (
              <li key={f.type}>
                <OutputSection title={f.type} badge={f.reaction}>
                  <div className="space-y-1.5">
                    <p className="rounded-lg bg-muted/50 px-3 py-2 font-medium">“{f.starter}”</p>
                    <p><span className="font-medium">Why it may work. </span>{f.whyItWorks}</p>
                    <p><span className="font-medium">Follow with. </span>{f.followWith}</p>
                    {projectId && (
                      <Button size="sm" variant="outline" onClick={() => addHook(projectId, f.starter, `${f.type} — ${f.reaction}`)}>
                        Save hook
                      </Button>
                    )}
                  </div>
                </OutputSection>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold">Saved hooks {project ? `— ${project.name}` : "(attach a project)"}</h2>
        <div className="mt-2 max-w-3xl">
          {projectId && intel ? (
            <SavedItems
              kind="hook"
              items={intel.hooks}
              onEdit={(id, text) => editItem(projectId, "hooks", id, text)}
              onStatus={(id, status) => setItemStatus(projectId, "hooks", id, status)}
              emptyHint="Save framework starters or your own drafts, then approve the strongest."
            />
          ) : (
            <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-text">
              Hooks save into project intelligence once a project is attached.
            </p>
          )}
        </div>
        <div className="mt-3 max-w-3xl">
          <LocalStorageNote compact />
        </div>
      </div>
    </div>
  );
}
