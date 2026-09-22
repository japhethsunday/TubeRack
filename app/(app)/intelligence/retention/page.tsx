"use client";

import { Suspense, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useIntel } from "@/src/components/intelligence/IntelProvider";
import { useProjects } from "@/src/components/projects/ProjectsProvider";
import { ProjectAttach, UsageNote, useIntelQuery } from "@/src/components/intelligence/chrome";
import { TaskRunner } from "@/src/components/intelligence/TaskRunner";
import { MethodologyNote, VersionHistory } from "@/src/components/intelligence/output";
import { analyzeRetention, RETENTION_METHODOLOGY, type OutlineSection } from "@/src/lib/intelligence/retention";
import { Input, Textarea } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";
import { LoadingState } from "@/src/components/ui/feedback";
import { Breadcrumb } from "@/src/components/ui/data";
import { LocalStorageNote } from "@/src/components/projects/ProjectsProvider";

const LEVEL_TONES: Record<string, "bad" | "warn" | "ok"> = {
  risk: "bad",
  friction: "warn",
  opportunity: "ok",
};

const LEVEL_LABELS: Record<string, string> = {
  risk: "Potential risk",
  friction: "Likely friction",
  opportunity: "Opportunity",
};

export default function RetentionPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading retention intelligence" />}>
      <RetentionBody />
    </Suspense>
  );
}

function RetentionBody() {
  const { projects } = useProjects();
  const { intelFor, addRetention } = useIntel();
  const { projectId: linkedProject } = useIntelQuery();
  const [projectId, setProjectId] = useState<string | null>(linkedProject);
  const [sections, setSections] = useState<OutlineSection[]>([
    { heading: "Hook — the payoff first", body: "" },
    { heading: "Setup — stakes and promise", body: "" },
    { heading: "Payoff — result and next step", body: "" },
  ]);

  const project = projects.find((p) => p.id === projectId);
  const intel = projectId ? intelFor(projectId) : null;

  function setSection(i: number, patch: Partial<OutlineSection>) {
    setSections((s) => s.map((sec, j) => (j === i ? { ...sec, ...patch } : sec)));
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Breadcrumb trail={[{ label: "Content Intelligence", href: "/intelligence" }, { label: "Retention" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Retention intelligence</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-text">
          Paste your outline — one beat per section — and inspect structural
          risks before you shoot. Risks, not predictions; nothing here knows
          your viewers.
        </p>
      </div>

      <ProjectAttach projectId={projectId} onChange={setProjectId} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Outline ({sections.length} beats)</h2>
          {sections.map((s, i) => (
            <fieldset key={i} className="rounded-lg border border-border p-3">
              <legend className="px-1 text-xs font-medium text-muted-text">Beat {i + 1}</legend>
              <div className="space-y-2">
                <Input label={`Heading ${i + 1}`} value={s.heading} onChange={(e) => setSection(i, { heading: e.target.value })} />
                <Textarea label={`Content ${i + 1}`} rows={3} value={s.body} onChange={(e) => setSection(i, { body: e.target.value })} placeholder="What happens in this beat…" />
                {sections.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setSections((prev) => prev.filter((_, j) => j !== i))}
                    className="inline-flex items-center gap-1 text-xs font-medium text-destructive hover:underline"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Remove beat
                  </button>
                )}
              </div>
            </fieldset>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSections((s) => [...s, { heading: `Beat ${s.length + 1}`, body: "" }])}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add beat
          </Button>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5">
          <TaskRunner
            task="retention-analysis"
            contextSummary={`${sections.length} beats, ${sections.reduce((n, s) => n + s.body.split(/\s+/).filter(Boolean).length, 0)} words`}
            idleHint="Checks opening weight, repetition, transitions, payoff presence, and overloaded beats."
            work={() => analyzeRetention(sections)}
            onCompleted={(r) => {
              if (projectId) addRetention(projectId, { summary: r.summary, flags: r.flags, estimateMinutes: r.estimateMinutes });
            }}
          >
            {(result) =>
              result && (
                <div className="space-y-2">
                  <p role="status" className="text-sm font-medium">{result.summary}</p>
                  <ul className="space-y-1.5" aria-label="Retention notes">
                    {result.flags.map((f, i) => (
                      <li key={`${f.area}-${i}`} className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                        <p className="flex items-center justify-between gap-2 font-medium">
                          {f.area}
                          <Badge tone={LEVEL_TONES[f.level]}>{LEVEL_LABELS[f.level]}</Badge>
                        </p>
                        <p className="mt-0.5 text-muted-text">{f.note}</p>
                        <p className="mt-0.5"><span className="font-medium">Suggested improvement. </span>{f.suggestion}</p>
                      </li>
                    ))}
                  </ul>
                  <MethodologyNote text={RETENTION_METHODOLOGY} />
                  {projectId && (
                    <p className="text-xs text-muted-text">Saved to {project?.name} retention history.</p>
                  )}
                </div>
              )
            }
          </TaskRunner>
          <div className="mt-4">
            <UsageNote kind="text" taskLabel="retention-analysis" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold">Saved reviews {project ? `— ${project.name}` : ""}</h2>
          <ul className="mt-2 space-y-2" aria-label="Saved retention reviews">
            {(intel?.retention ?? []).map((r) => (
              <li key={r.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
                <p className="font-medium">{r.summary}</p>
                <p className="text-xs text-muted-text">
                  {r.estimateMinutes} min estimate · {r.flags.length} note(s) · {new Date(r.createdAt).toLocaleDateString()}
                </p>
              </li>
            ))}
            {(intel?.retention ?? []).length === 0 && (
              <li className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-text">
                {projectId ? "No reviews saved for this project yet." : "Attach a project to keep review history."}
              </li>
            )}
          </ul>
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
