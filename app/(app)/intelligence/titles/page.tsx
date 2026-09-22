"use client";

import { Suspense, useState } from "react";
import { useIntel } from "@/src/components/intelligence/IntelProvider";
import { useProjects } from "@/src/components/projects/ProjectsProvider";
import { ProjectAttach, UsageNote, useIntelQuery } from "@/src/components/intelligence/chrome";
import { TaskRunner } from "@/src/components/intelligence/TaskRunner";
import { SavedItems } from "@/src/components/intelligence/SavedItems";
import { MethodologyNote, VersionHistory } from "@/src/components/intelligence/output";
import { analyzeTitle, generateTitleDirections } from "@/src/lib/intelligence/titles";
import { Input } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";
import { LoadingState } from "@/src/components/ui/feedback";
import { Breadcrumb } from "@/src/components/ui/data";
import { LocalStorageNote } from "@/src/components/projects/ProjectsProvider";

const TITLE_METHODOLOGY =
  "Local text checks (no AI, no performance data). Length, caps, punctuation, specificity signals, " +
  "curiosity patterns, outcome verbs, and absolute-claim flags. Guidance reflects display conventions, " +
  "not predictions — no title is scored or ranked.";

export default function TitlesPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading title intelligence" />}>
      <TitlesBody />
    </Suspense>
  );
}

function TitlesBody() {
  const { projects } = useProjects();
  const { intelFor, addTitle, setItemStatus, editItem } = useIntel();
  const { projectId: linkedProject } = useIntelQuery();
  const [projectId, setProjectId] = useState<string | null>(linkedProject);
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [candidate, setCandidate] = useState("");
  const [directions, setDirections] = useState<ReturnType<typeof generateTitleDirections> | null>(null);

  const project = projects.find((p) => p.id === projectId);
  const intel = projectId ? intelFor(projectId) : null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Breadcrumb trail={[{ label: "Content Intelligence", href: "/intelligence" }, { label: "Titles" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Title intelligence</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-text">
          Check a draft against trust and clarity rules, explore eight honest
          directions, then save, edit, compare, and approve. Nothing here claims
          to predict clicks.
        </p>
      </div>

      <ProjectAttach projectId={projectId} onChange={setProjectId} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
          <Input label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Payoff-first openings" />
          <Input label="Audience (optional)" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="New creators" />
          <Input label="Draft title to analyze" value={candidate} onChange={(e) => setCandidate(e.target.value)} placeholder="Paste a working title…" />
          <TaskRunner
            task="title-analysis"
            contextSummary={candidate ? `“${candidate.slice(0, 50)}”` : "no draft yet"}
            idleHint="Runs seven checks over your draft title."
            work={() => analyzeTitle(candidate)}
            onCompleted={() => setDirections(generateTitleDirections(topic || candidate, audience))}
          >
            {(result) =>
              result && (
                <div className="space-y-2">
                  <p role="status" className="text-sm font-medium">{result.summary}</p>
                  <ul className="space-y-1.5" aria-label="Title checks">
                    {result.checks.map((c) => (
                      <li key={c.check} className="flex items-start justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                        <span>
                          <span className="font-medium">{c.check}. </span>
                          <span className="text-muted-text">{c.note}</span>
                        </span>
                        <Badge tone={c.verdict === "pass" ? "ok" : c.verdict === "watch" ? "warn" : "bad"}>
                          {c.verdict}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                  <MethodologyNote text={TITLE_METHODOLOGY} />
                </div>
              )
            }
          </TaskRunner>
          <UsageNote kind="text" taskLabel="title-analysis" />
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Directions {directions ? "" : "(run analysis to generate)"}</h2>
          {directions ? (
            <ul className="space-y-2" aria-label="Title directions">
              {directions.map((d) => (
                <li key={d.category} className="rounded-xl border border-border bg-surface p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-text">{d.category}</p>
                  <ul className="mt-1.5 space-y-1.5">
                    {d.variants.map((v) => (
                      <li key={v} className="flex items-center justify-between gap-2 text-sm">
                        <span>“{v}”</span>
                        {projectId ? (
                          <Button size="sm" variant="ghost" onClick={() => addTitle(projectId, v, `${d.category} direction`)}>
                            Save
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-text">
              Directions appear here after a run — two editable variants per category.
            </p>
          )}
          {!projectId && directions && (
            <p className="text-xs text-muted-text">Attach a project above to save directions.</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold">
            Saved titles {intel ? `— ${project?.name}` : "(attach a project)"}
          </h2>
          <div className="mt-2">
            {projectId && intel ? (
              <SavedItems
                kind="title"
                items={intel.titles}
                onEdit={(id, text) => editItem(projectId, "titles", id, text)}
                onStatus={(id, status) => setItemStatus(projectId, "titles", id, status)}
                emptyHint="Save directions or your own drafts. Approve the ones that survive comparison."
              />
            ) : (
              <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-text">
                Titles save into project intelligence once a project is attached.
              </p>
            )}
          </div>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Version history</h2>
          <div className="mt-2 rounded-xl border border-border bg-surface p-4">
            {intel ? <VersionHistory entries={intel.history} /> : <p className="text-xs text-muted-text">Attach a project to see saves and reviews.</p>}
          </div>
          <div className="mt-3">
            <LocalStorageNote compact />
          </div>
        </div>
      </div>
    </div>
  );
}
