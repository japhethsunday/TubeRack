"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useIntel } from "@/src/components/intelligence/IntelProvider";
import { useProjects } from "@/src/components/projects/ProjectsProvider";
import { ProjectAttach, DnaStrip, UsageNote } from "@/src/components/intelligence/chrome";
import { TaskRunner } from "@/src/components/intelligence/TaskRunner";
import {
  OutputSection,
  RatingBadge,
  MethodologyNote,
  ContextChips,
} from "@/src/components/intelligence/output";
import { analyzeIdea, suggestAngles, IDEA_METHODOLOGY, type DimensionResult, type Angle } from "@/src/lib/intelligence/idea";
import { assembleContext } from "@/src/lib/intelligence/context";
import { Textarea, Input } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";
import { LoadingState } from "@/src/components/ui/feedback";
import { Breadcrumb } from "@/src/components/ui/data";

export default function IdeaLabPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading Idea Lab" />}>
      <Lab />
    </Suspense>
  );
}

function Lab() {
  const params = useSearchParams();
  const { projects, channelName } = useProjects();
  const { dnaFor, saveOpportunity } = useIntel();
  const [projectId, setProjectId] = useState<string | null>(params.get("project"));
  const [idea, setIdea] = useState(params.get("idea") ?? "");
  const [audience, setAudience] = useState("");
  const [problem, setProblem] = useState("");
  const [differentiation, setDifferentiation] = useState("");
  const [analysis, setAnalysis] = useState<{ dimensions: DimensionResult[]; summary: string } | null>(null);
  const [angles, setAngles] = useState<Angle[] | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);

  const project = projects.find((p) => p.id === projectId);
  const context = useMemo(
    () =>
      assembleContext("idea-analysis", {
        idea,
        audience,
        channelName: project ? channelName(project.channelId) : undefined,
        projectName: project?.name,
        projectTopic: project?.topic,
        projectGoal: project?.goal,
        dna: project ? dnaFor(project.channelId) : null,
      }),
    [idea, audience, project, channelName, dnaFor],
  );

  function saveAngle(a: Angle) {
    saveOpportunity({
      title: a.hookDirection,
      topic: idea.trim(),
      angle: a.category,
      audience: audience.trim(),
      reasoning: `${a.what} ${a.whyItWorks} Risk: ${a.risk}`,
      format: a.category,
      hook: a.hookDirection,
      sourceTask: "topic-discovery",
      projectId: projectId ?? undefined,
    });
    setSavedIds((s) => [...s, a.category]);
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Breadcrumb trail={[{ label: "Content Intelligence", href: "/intelligence" }, { label: "Idea Lab" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Idea Lab</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-text">
          Enter a raw idea — topic, question, problem, or keyword — and develop
          it into differentiated angles with explicit strengths and risks.
        </p>
      </div>

      <ProjectAttach projectId={projectId} onChange={setProjectId} />
      {project && <DnaStrip channelId={project.channelId} channelName={channelName(project.channelId)} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
          <Textarea label="Raw idea" rows={3} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="How to start a YouTube channel" />
          <Input label="Audience (optional)" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="New creators under 10k subs" />
          <Textarea label="Viewer problem (optional)" rows={2} value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="They post for months with no traction" />
          <Input label="Differentiation (optional)" value={differentiation} onChange={(e) => setDifferentiation(e.target.value)} placeholder="Payoff-first, tested across 30 videos" />
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <TaskRunner
            task="idea-analysis"
            contextSummary={`${idea ? `${idea.split(/\s+/).length} idea words` : "no idea yet"}${audience ? " + audience" : ""}${project ? ` + ${project.name}` : ""}`}
            idleHint="Analysis rates 10 dimensions from what you entered — strengths, risks, opportunities, recommendations."
            work={() => analyzeIdea({ idea, audience, problem, differentiation })}
            onCompleted={(r) => {
              setAnalysis(r);
              setAngles(suggestAngles(idea));
            }}
          >
            {(result) =>
              result && (
                <div className="space-y-2">
                  <p role="status" className="text-sm font-medium">{result.summary}</p>
                  {result.dimensions.map((d) => (
                    <OutputSection key={d.dimension} title={d.dimension} badge={d.rating} defaultOpen={d.rating === "gap"}>
                      <div className="space-y-1.5">
                        <RatingBadge rating={d.rating} />
                        <p><span className="font-medium">Strength. </span>{d.strength}</p>
                        <p><span className="font-medium">Risk. </span>{d.risk}</p>
                        <p><span className="font-medium">Opportunity. </span>{d.opportunity}</p>
                        <p><span className="font-medium">Recommendation. </span>{d.recommendation}</p>
                      </div>
                    </OutputSection>
                  ))}
                  <MethodologyNote text={IDEA_METHODOLOGY} />
                </div>
              )
            }
          </TaskRunner>
          <div className="mt-4">
            <UsageNote kind="text" taskLabel="idea-analysis" />
          </div>
        </div>
      </div>

      {angles && (
        <section aria-label="Content angles">
          <h2 className="text-sm font-semibold">12 differentiated angles</h2>
          <p className="mt-0.5 text-xs text-muted-text">Fixed frameworks, your topic slotted in. No ranking — you choose.</p>
          <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {angles.map((a) => (
              <li key={a.category} className="flex flex-col rounded-xl border border-border bg-surface p-4">
                <p className="flex items-center justify-between gap-2 text-sm font-medium">
                  {a.category}
                  {savedIds.includes(a.category) ? (
                    <Badge tone="ok">Saved</Badge>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => saveAngle(a)}>
                      Save
                    </Button>
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-text">{a.what} {a.whyItWorks}</p>
                <p className="mt-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">“{a.hookDirection}”</p>
                <p className="mt-1 text-xs text-muted-text">
                  Save it, then refine the wording in{" "}
                  <Link href="/intelligence/titles" className="underline">
                    Title intelligence
                  </Link>
                  .
                </p>
                <p className="mt-2 text-xs text-muted-text">
                  <span className="font-medium text-foreground">Risk: </span>{a.risk}
                </p>
              </li>
            ))}
          </ul>
          {analysis && (
            <div className="mt-4">
              <ContextChips context={context} />
            </div>
          )}
        </section>
      )}

      <p className="text-sm text-muted-text">
        Found a keeper?{" "}
        <Link href="/intelligence/strategy" className="font-medium text-foreground underline">
          Develop it into a strategy
        </Link>
        .
      </p>
    </div>
  );
}
