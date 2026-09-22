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

const STAGE_TAB: Record<ProjectStage, string> = {
  idea: "overview",
  research: "research",
  strategy: "strategy",
  script: "script",
  storyboard: "storyboard",
  visuals: "assets",
  voice: "audio",
  music: "audio",
  video: "video",
  thumbnail: "thumbnail",
  seo: "seo",
  repurposing: "publishing",
  publishing: "publishing",
  analytics: "overview",
  improvement: "overview",
};

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
          body="It may have been deleted on this device, or the link came from another browser. Projects live in local storage until cloud sync ships in Phase 11."
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
          {(() => {
            const inScriptWork = ["idea", "research", "strategy", "script", "storyboard"].includes(project.currentStage);
            const studioHref = `/studio/script?project=${project.id}`;
            const previewHref = `/projects/preview?stage=${STAGE_TAB[project.currentStage]}`;
            const primary = inScriptWork
              ? { href: studioHref, label: continueLabelFor(project) }
              : { href: previewHref, label: `${continueLabelFor(project)} (preview)` };
            const secondary = inScriptWork
              ? { href: previewHref, label: "Module preview" }
              : { href: studioHref, label: "Script Studio" };
            return (
              <>
                <Link
                  href={secondary.href}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted"
                  onClick={() => touch(project.id)}
                >
                  {secondary.label}
                </Link>
                <Link
                  href={primary.href}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
                  onClick={() => touch(project.id)}
                >
                  {primary.label}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </>
            );
          })()}
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
              All 15 stages complete. Analytics and improvement loops attach in Phase 10.
            </p>
          ) : null}
        </section>

        <section aria-label="Production modules" className="lg:col-span-2">
          <h2 className="text-sm font-semibold">Production modules</h2>
          <p className="mt-0.5 text-xs text-muted-text">
            Module layouts are static previews — tools connect in Phases 5–9 + 11.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {PROJECT_STAGES.map((stage) => {
              const state = project.stages[stage];
              return (
                <li key={stage}>
                  <Link
                    href={`/projects/preview?stage=${STAGE_TAB[stage]}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 transition-colors duration-150 hover:border-muted-text/50 hover:bg-muted/40"
                  >
                    <span className="text-sm font-medium">{stageLabel(stage)}</span>
                    <Badge tone={state === "complete" ? "ok" : state === "in-progress" ? "info" : "preview"}>
                      {state === "complete" ? "Complete" : state === "in-progress" ? "In progress" : "Preview"}
                    </Badge>
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
              and approve titles and hooks — they collect here for Phase 6.
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
