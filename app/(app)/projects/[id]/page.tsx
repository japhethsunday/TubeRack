"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Pencil, Copy, Archive, RotateCcw, Trash2, Brain } from "lucide-react";
import { useProjects, LocalStorageNote } from "@/src/components/projects/ProjectsProvider";
import { useIntel } from "@/src/components/intelligence/IntelProvider";
import { intelCounts } from "@/src/lib/intelligence/shelf";
import { PipelineProgress } from "@/src/components/projects/PipelineProgress";
import { continueLabelFor, progressOf } from "@/src/lib/projects/store";
import { PROJECT_STAGES, type ProjectStage } from "@/src/types/domain";
import { stageLabel } from "@/src/lib/projects/storage";
import { timeAgo, formatDateTime } from "@/src/components/projects/time";
import { Breadcrumb } from "@/src/components/ui/data";
import { Badge } from "@/src/components/ui/Badge";
import { Button } from "@/src/components/ui/Button";
import { Modal, Drawer } from "@/src/components/ui/overlays";
import { ConfirmDialog } from "@/src/components/ui/Section";
import { Input, Textarea } from "@/src/components/ui/fields";
import { EmptyState, ErrorState } from "@/src/components/ui/states";
import { LoadingState, Progress } from "@/src/components/ui/feedback";

/** Every pipeline stage opens the real tool for this project. */
function stageHref(stage: ProjectStage, projectId: string): string {
  const q = `project=${encodeURIComponent(projectId)}`;
  const map: Record<ProjectStage, string> = {
    idea: `/intelligence/lab?${q}`,
    research: `/intelligence/research?${q}`,
    strategy: `/intelligence/strategy?${q}`,
    script: `/studio/script?${q}`,
    storyboard: `/studio/storyboard?${q}`,
    visuals: `/studio/media?${q}&tab=image`,
    voice: `/studio/media?${q}&tab=voice`,
    music: `/studio/media?${q}&tab=audio`,
    video: `/studio/video?${q}`,
    thumbnail: `/studio/package?${q}&tab=thumbnail`,
    seo: `/studio/package?${q}&tab=seo`,
    repurposing: `/studio/package?${q}&tab=repurpose`,
    publishing: `/studio/package?${q}&tab=platforms`,
    analytics: `/analytics?${q}`,
    improvement: `/analytics?${q}`,
  };
  return map[stage];
}

/** Project command center: header, pipeline, modules, summary, continue. */
export default function ProjectOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const {
    ready,
    projects,
    channelName,
    rename,
    update,
    duplicate,
    archive,
    restore,
    remove,
    completeStage,
    touch,
  } = useProjects();
  const { intelFor } = useIntel();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [deleting, setDeleting] = useState(false);

  if (!ready) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <LoadingState label="Loading project" />
      </div>
    );
  }

  const project = projects.find((p) => p.id === id);
  if (!project) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <Breadcrumb trail={[{ label: "Projects", href: "/projects" }, { label: "Not found" }]} />
        <ErrorState
          title="Project not found"
          body="It may have been deleted, or it belongs to another account. Sign in to see projects synced to your account."
          recoveryHref="/projects"
          recoveryLabel="Back to projects"
        />
      </div>
    );
  }

  const progress = progressOf(project);
  const allDone = PROJECT_STAGES.every((s) => project.stages[s] === "complete");

  function openEditor(name: string, description: string) {
    setName(name);
    setDescription(description);
    setEditing(true);
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Breadcrumb
        trail={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Projects", href: "/projects" },
          { label: project.name },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-surface p-5">
        <div className="min-w-0">
          <p className="text-xs text-muted-text">
            {channelName(project.channelId)} · {project.contentType} · {project.platform}
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{project.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-text">
            <Badge tone={project.status === "archived" ? "neutral" : project.status === "active" ? "ok" : "info"}>
              {project.status}
            </Badge>
            <span>
              Current stage: <span className="font-medium text-foreground">{stageLabel(project.currentStage)}</span>
            </span>
            <span title={formatDateTime(project.updatedAt)}>Updated {timeAgo(project.updatedAt)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => openEditor(project.name, project.description)}>
            <Pencil className="size-4" aria-hidden="true" />
            Edit details
          </Button>
          <Link
            href={stageHref(project.currentStage, project.id)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
            onClick={() => touch(project.id)}
          >
            {continueLabelFor(project)}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
      <LocalStorageNote compact />

      <div className="grid gap-4 lg:grid-cols-3">
        <section aria-label="Production pipeline" className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Production pipeline</h2>
          <div className="mt-2">
            <Progress value={progress} label="Overall progress" />
          </div>
          <div className="mt-3">
            <PipelineProgress stages={project.stages} current={project.currentStage} />
          </div>
          {!allDone && project.status !== "archived" ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-4 w-full"
              onClick={() => completeStage(project.id)}
            >
              <Check className="size-4" aria-hidden="true" />
              Mark “{stageLabel(project.currentStage)}” complete
            </Button>
          ) : allDone ? (
            <p role="status" className="mt-4 rounded-lg border border-success/30 bg-success/10 p-3 text-sm">
              All 15 stages complete. Track performance in Analytics and feed learnings into your next idea.
            </p>
          ) : null}
        </section>

        <section aria-label="Production modules" className="lg:col-span-2">
          <h2 className="text-sm font-semibold">Production modules</h2>
          <p className="mt-0.5 text-xs text-muted-text">
            Open any stage to work on it. Mark a stage complete to move the pipeline forward.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {PROJECT_STAGES.map((stage) => {
              const state = project.stages[stage];
              return (
                <li key={stage}>
                  <Link
                    href={stageHref(stage, project.id)}
                    onClick={() => touch(project.id)}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 transition-colors duration-150 hover:border-muted-text/50 hover:bg-muted/40"
                  >
                    <span className="text-sm font-medium">{stageLabel(stage)}</span>
                    <span className="flex items-center gap-2">
                      {state === "complete" ? (
                        <Badge tone="ok">Complete</Badge>
                      ) : state === "in-progress" ? (
                        <Badge tone="info">In progress</Badge>
                      ) : (
                        <span className="text-xs text-muted-text">Open</span>
                      )}
                      <ArrowRight className="size-3.5 text-muted-text" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section aria-label="Project intelligence" className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Brain className="size-4 text-muted-text" aria-hidden="true" />
            Project intelligence
          </h2>
          <Link
            href={`/intelligence/lab?project=${project.id}`}
            className="text-xs font-medium underline"
          >
            Open in Idea Lab
          </Link>
        </div>
        {(() => {
          const counts = intelCounts(intelFor(project.id));
          const parts = [
            counts.hasAudience && "Audience profile",
            counts.hasStrategy && "Strategy brief",
            counts.titles > 0 && `${counts.titles} title(s)`,
            counts.hooks > 0 && `${counts.hooks} hook(s)`,
            counts.retention > 0 && `${counts.retention} retention review(s)`,
          ].filter(Boolean);
          return parts.length === 0 ? (
            <p className="mt-2 text-sm text-muted-text">
              No intelligence saved yet. Analyze the idea, define the audience,
              and approve titles and hooks — they collect here and feed the Script Studio.
            </p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Saved intelligence">
              {parts.map((p) => (
                <li key={p as string}>
                  <Badge tone="ok">{p as string}</Badge>
                </li>
              ))}
              {counts.approved > 0 && <li><Badge tone="neutral">{counts.approved} approved</Badge></li>}
            </ul>
          );
        })()}
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {[
            ["/intelligence/audience", "Audience"],
            ["/intelligence/strategy", "Strategy"],
            ["/intelligence/titles", "Titles"],
            ["/intelligence/hooks", "Hooks"],
            ["/intelligence/retention", "Retention"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={`${href}?project=${project.id}`}
              className="rounded-lg border border-border px-2.5 py-1.5 font-medium hover:bg-muted"
            >
              {label}
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="Project summary" className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Summary</h2>
          <dl className="mt-2 space-y-2 text-sm">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-text">Topic</dt>
              <dd className="mt-0.5">{project.topic}</dd>
            </div>
            {project.description && (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-text">Description</dt>
                <dd className="mt-0.5 text-muted-text">{project.description}</dd>
              </div>
            )}
            {project.goal && (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-text">Goal</dt>
                <dd className="mt-0.5 text-muted-text">{project.goal}</dd>
              </div>
            )}
            <div className="flex gap-6 text-xs text-muted-text">
              <span title={formatDateTime(project.createdAt)}>Created {timeAgo(project.createdAt)}</span>
              <span title={formatDateTime(project.updatedAt)}>Modified {timeAgo(project.updatedAt)}</span>
            </div>
          </dl>
        </section>
        <section aria-label="Project actions" className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Manage</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/studio/package?project=${project.id}`}
              className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Packaging Studio
            </Link>
            <Link
              href={`/studio/media?project=${project.id}`}
              className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Media Studio
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const copy = duplicate(project.id);
                router.push(`/projects/${copy.id}`);
              }}
            >
              <Copy className="size-4" aria-hidden="true" />
              Duplicate
            </Button>
            {project.status === "archived" ? (
              <Button variant="outline" size="sm" onClick={() => restore(project.id)}>
                <RotateCcw className="size-4" aria-hidden="true" />
                Restore
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => archive(project.id)}>
                <Archive className="size-4" aria-hidden="true" />
                Archive
              </Button>
            )}
            <Button variant="destructive" size="sm" onClick={() => setDeleting(true)}>
              <Trash2 className="size-4" aria-hidden="true" />
              Delete
            </Button>
          </div>
          {project.status === "archived" && (
            <div className="mt-3">
              <EmptyState
                title="Archived"
                body="This project is read-only history. Restore it to continue production."
              />
            </div>
          )}
        </section>
      </div>

      <Link href="/projects" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-text hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        All projects
      </Link>

      {editing && (
        <Modal title="Edit project details" onClose={() => setEditing(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              rename(project.id, name);
              update(project.id, { description });
              setEditing(false);
            }}
            className="space-y-4"
          >
            <Input label="Project name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <Textarea label="Description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="submit">Save changes</Button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <Drawer title="Delete project?" description="This removes it from this device." onClose={() => setDeleting(false)}>
          <ConfirmDialog
            title="Delete project?"
            body={`“${project.name}” and its stage progress will be gone from this browser. This cannot be undone.`}
            confirmLabel="Delete forever"
            onConfirm={() => {
              remove(project.id);
              router.push("/projects");
            }}
            onCancel={() => setDeleting(false)}
          />
        </Drawer>
      )}
    </div>
  );
}
