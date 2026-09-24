"use client";

import { Suspense, useState } from "react";
import { useIntel } from "@/src/components/intelligence/IntelProvider";
import { useProjects } from "@/src/components/projects/ProjectsProvider";
import { ProjectAttach, UsageNote, useIntelQuery } from "@/src/components/intelligence/chrome";
import { TaskRunner } from "@/src/components/intelligence/TaskRunner";
import { ContextChips, VersionHistory } from "@/src/components/intelligence/output";
import {
  STRATEGY_FIELDS,
  emptyStrategyBrief,
  emptyAudienceProfile,
  strategyCompleteness,
  missingStrategyFields,
  buildProductionBrief,
  type StrategyBrief,
} from "@/src/lib/intelligence/profiles";
import { assembleContext } from "@/src/lib/intelligence/context";
import { missingDnaFields } from "@/src/lib/intelligence/dna";
import { Textarea, Input } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { Progress } from "@/src/components/ui/feedback";
import { LoadingState } from "@/src/components/ui/feedback";
import { Breadcrumb } from "@/src/components/ui/data";
import { LocalStorageNote } from "@/src/components/projects/ProjectsProvider";

export default function StrategyPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading strategy engine" />}>
      <StrategyBody />
    </Suspense>
  );
}

function StrategyBody() {
  const { projects, channelName, update } = useProjects();
  const { dnaFor, intelFor, saveStrategyFor, saveBriefFor } = useIntel();
  const { projectId: linkedProject } = useIntelQuery();
  const [projectId, setProjectId] = useState<string | null>(linkedProject);
  const [idea, setIdea] = useState("");
  const [draft, setDraft] = useState<StrategyBrief>(() => emptyStrategyBrief());
  const [brief, setBrief] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);

  const project = projects.find((p) => p.id === projectId);
  const intel = projectId ? intelFor(projectId) : null;
  const dna = project ? dnaFor(project.channelId) : null;
  const completeness = strategyCompleteness(draft);

  function assemble() {
    return buildProductionBrief({
      idea: idea || project?.topic || "",
      audience: intel?.audience ?? emptyAudienceProfile(),
      strategy: draft,
      dnaSummary: dna ? missingDnaFields(dna).length < 11 ? `Tone: ${dna.tone}. Positioning: ${dna.positioning}.` : "" : "",
    });
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Breadcrumb trail={[{ label: "Content Intelligence", href: "/intelligence" }, { label: "Strategy" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Content strategy engine</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-text">
          Strategy as structured data — angle, promise, narrative, format — not
          a paragraph. Assembles into a production brief the Script Studio uses.
        </p>
      </div>

      <ProjectAttach projectId={projectId} onChange={setProjectId} />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 rounded-xl border border-border bg-surface p-5 lg:col-span-3">
          <Input label="Core idea" value={idea} onChange={(e) => setIdea(e.target.value)} placeholder={project?.topic ?? "What is this video about?"} />
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Strategy brief — {completeness}% defined</h2>
            {intel?.strategy && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => intel.strategy && setDraft({ ...intel.strategy })}
              >
                Load saved
              </Button>
            )}
          </div>
          <Progress value={completeness} label="Brief completeness" />
          <div className="grid gap-4 sm:grid-cols-2">
            {STRATEGY_FIELDS.map((f) => (
              <Textarea
                key={f.key}
                label={f.label}
                rows={2}
                value={draft[f.key]}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value, updatedAt: new Date().toISOString() }))}
              />
            ))}
          </div>
          <p className="text-xs text-muted-text">
            {missingStrategyFields(draft).length > 0
              ? `Still open: ${missingStrategyFields(draft).join(", ")}.`
              : "Complete — assemble the brief."}
          </p>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border border-border bg-surface p-5">
            <TaskRunner
              task="brief-generation"
              contextSummary={`idea + strategy ${completeness}%${project ? ` + ${project.name}` : ""}${intel?.audience ? " + saved audience" : ""}`}
              idleHint="Assembles idea, saved audience, strategy fields, and DNA into one production brief."
              work={assemble}
              onCompleted={(b) => {
                setBrief(b);
                setCopied(false);
                setApplied(false);
                if (projectId) saveBriefFor(projectId, b);
              }}
            >
              {(result) =>
                result && (
                  <div className="space-y-3">
                    <div className="max-h-64 overflow-y-auto rounded-lg bg-muted/50 p-3">
                      <pre className="whitespace-pre-wrap font-mono text-xs">{result}</pre>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(result);
                            setCopied(true);
                          } catch {
                            setCopied(false);
                          }
                        }}
                      >
                        {copied ? "Copied" : "Copy brief"}
                      </Button>
                      {project && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            update(project.id, {
                              goal: draft.promise || project.goal,
                              description: draft.takeaway
                                ? `${project.description}\n\nTakeaway: ${draft.takeaway}`.trim()
                                : project.description,
                            });
                            setApplied(true);
                          }}
                        >
                          Apply to project
                        </Button>
                      )}
                    </div>
                    {applied && (
                      <p role="status" className="text-sm text-success">
                        Applied: promise → goal, takeaway appended to description.
                      </p>
                    )}
                  </div>
                )
              }
            </TaskRunner>
            <div className="mt-4 space-y-3">
              <UsageNote kind="text" taskLabel="brief-generation" />
              <ContextChips
                context={assembleContext("content-strategy", {
                  idea: idea || project?.topic,
                  audience: intel?.audience ? "Saved audience profile attached." : undefined,
                  channelName: project ? channelName(project.channelId) : undefined,
                  projectName: project?.name,
                  projectTopic: project?.topic,
                  dna,
                })}
              />
              {projectId && (
                <Button
                  onClick={() => saveStrategyFor(projectId, { ...draft, updatedAt: new Date().toISOString() })}
                >
                  Save brief fields to {project?.name ?? "project"}
                </Button>
              )}
              {intel && <VersionHistory entries={intel.history} />}
              <LocalStorageNote compact />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
