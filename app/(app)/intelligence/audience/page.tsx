"use client";

import { Suspense, useState } from "react";
import { useIntel } from "@/src/components/intelligence/IntelProvider";
import { useProjects } from "@/src/components/projects/ProjectsProvider";
import { ProjectAttach, UsageNote, useIntelQuery } from "@/src/components/intelligence/chrome";
import { TaskRunner } from "@/src/components/intelligence/TaskRunner";
import { ContextChips, VersionHistory } from "@/src/components/intelligence/output";
import {
  AUDIENCE_FIELDS,
  emptyAudienceProfile,
  audienceCompleteness,
  missingAudienceFields,
  type AudienceProfile,
} from "@/src/lib/intelligence/profiles";
import { assembleContext } from "@/src/lib/intelligence/context";
import { Textarea } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { Progress } from "@/src/components/ui/feedback";
import { LoadingState } from "@/src/components/ui/feedback";
import { Breadcrumb } from "@/src/components/ui/data";
import { LocalStorageNote } from "@/src/components/projects/ProjectsProvider";

export default function AudiencePage() {
  return (
    <Suspense fallback={<LoadingState label="Loading audience intelligence" />}>
      <AudienceBody />
    </Suspense>
  );
}

function AudienceBody() {
  const { projects, channelName } = useProjects();
  const { dnaFor, intelFor, saveAudienceFor } = useIntel();
  const { projectId: linkedProject } = useIntelQuery();
  const [projectId, setProjectId] = useState<string | null>(linkedProject);
  const [draft, setDraft] = useState<AudienceProfile>(() => emptyAudienceProfile());
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const project = projects.find((p) => p.id === projectId);
  const intel = projectId ? intelFor(projectId) : null;
  const completeness = audienceCompleteness(draft);
  const missing = missingAudienceFields(draft);

  function loadFromIntel() {
    if (intel?.audience) {
      setDraft({ ...intel.audience });
      setSavedAt(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Breadcrumb trail={[{ label: "Content Intelligence", href: "/intelligence" }, { label: "Audience" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Audience intelligence</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-text">
          Define the viewer once — problem, desire, intent, objections. The profile
          is reused by Script, Thumbnail, SEO, and Repurposing later.
        </p>
      </div>

      <ProjectAttach projectId={projectId} onChange={setProjectId} />

      <div className="grid gap-4 lg:grid-cols-5">
        <form
          onSubmit={(e) => e.preventDefault()}
          className="space-y-4 rounded-xl border border-border bg-surface p-5 lg:col-span-3"
          aria-label="Audience profile"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Audience profile — {completeness}% defined</h2>
            {intel?.audience && (
              <Button size="sm" variant="ghost" onClick={loadFromIntel}>
                Load saved
              </Button>
            )}
          </div>
          <Progress value={completeness} label="Profile completeness" />
          <div className="grid gap-4 sm:grid-cols-2">
            {AUDIENCE_FIELDS.map((f) => (
              <Textarea
                key={f.key}
                label={f.label}
                rows={2}
                value={draft[f.key]}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value, updatedAt: new Date().toISOString() }))}
              />
            ))}
          </div>
          {missing.length > 0 && (
            <p className="text-xs text-muted-text">Still open: {missing.join(", ")}.</p>
          )}
        </form>

        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border border-border bg-surface p-5">
            <TaskRunner
              task="audience-analysis"
              contextSummary={`${completeness}% profile${project ? ` + ${project.name}` : ""}`}
              idleHint="Review checks the profile for decision-ready coverage and names exactly what is missing."
              work={() => ({ completeness, missing })}
              onCompleted={() => {}}
            >
              {(result) =>
                result && (
                  <div className="text-sm">
                    <p role="status" className="font-medium">
                      {result.completeness === 100
                        ? "Decision-ready: every field is defined. Save it to the project."
                        : result.completeness >= 55
                          ? `Workable at ${result.completeness}%, but fill the gaps before scripting.`
                          : `Too thin at ${result.completeness}% — an undefined audience makes every later choice a guess.`}
                    </p>
                    {result.missing.length > 0 && (
                      <p className="mt-1 text-muted-text">Missing: {result.missing.join(", ")}.</p>
                    )}
                  </div>
                )
              }
            </TaskRunner>
            <div className="mt-4">
              <UsageNote kind="text" taskLabel="audience-analysis" />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-5">
            <ContextChips
              context={assembleContext("audience-analysis", {
                audience: AUDIENCE_FIELDS.map((f) => draft[f.key]).filter(Boolean).join(" ").slice(0, 200),
                channelName: project ? channelName(project.channelId) : undefined,
                projectName: project?.name,
                dna: project ? dnaFor(project.channelId) : null,
              })}
            />
            {projectId ? (
              <div className="mt-3 space-y-2">
                <Button
                  onClick={() => {
                    saveAudienceFor(projectId, { ...draft, updatedAt: new Date().toISOString() });
                    setSavedAt(new Date().toISOString());
                  }}
                >
                  Save to {project?.name ?? "project"}
                </Button>
                {savedAt && (
                  <p role="status" className="text-sm text-success">
                    Saved on this device.
                  </p>
                )}
                {intel && <VersionHistory entries={intel.history} />}
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-text">
                Attach a project above to save this profile into its intelligence.
              </p>
            )}
            <div className="mt-3">
              <LocalStorageNote compact />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
