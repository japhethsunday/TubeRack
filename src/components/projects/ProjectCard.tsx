import Link from "next/link";
import { Archive, Copy, Pencil, RotateCcw, Trash2, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import type { Project } from "@/src/lib/projects/types";
import { continueLabelFor, progressOf } from "@/src/lib/projects/store";
import { stageLabel } from "@/src/lib/projects/storage";
import { Badge } from "@/src/components/ui/Badge";
import { Progress } from "@/src/components/ui/feedback";
import { timeAgo } from "@/src/components/projects/time";

function StatusBadge({ project }: { project: Project }) {
  const tone = project.status === "archived" ? "neutral" : project.status === "active" ? "ok" : "info";
  const label = project.status === "archived" ? "Archived" : project.status === "active" ? "Active" : "Draft";
  return <Badge tone={tone}>{label}</Badge>;
}

/** Project card: cover, title, channel, stage, progress, updated, actions. */
export function ProjectCard({
  project,
  channel,
  view,
  onRename,
  onDuplicate,
  onArchive,
  onRestore,
  onDelete,
}: {
  project: Project;
  channel: string;
  view: "grid" | "list";
  onRename: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const progress = progressOf(project);

  const actions = (
    <>
      <button type="button" onClick={onRename} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted">
        <Pencil className="size-4 text-muted-text" aria-hidden="true" /> Rename
      </button>
      <button type="button" onClick={onDuplicate} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted">
        <Copy className="size-4 text-muted-text" aria-hidden="true" /> Duplicate
      </button>
      {project.status === "archived" ? (
        <button type="button" onClick={onRestore} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted">
          <RotateCcw className="size-4 text-muted-text" aria-hidden="true" /> Restore
        </button>
      ) : (
        <button type="button" onClick={onArchive} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted">
          <Archive className="size-4 text-muted-text" aria-hidden="true" /> Archive
        </button>
      )}
      <button type="button" onClick={onDelete} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-destructive hover:bg-destructive/10">
        <Trash2 className="size-4" aria-hidden="true" /> Delete
      </button>
    </>
  );

  return (
    <article
      aria-label={project.name}
      className={
        view === "grid"
          ? "flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition-colors duration-150 hover:border-muted-text/50"
          : "flex items-center gap-4 rounded-xl border border-border bg-surface p-4 transition-colors duration-150 hover:border-muted-text/50"
      }
    >
      {view === "grid" ? (
        <Link href={`/projects/${project.id}`} className="block aspect-video bg-muted" aria-label={`Open ${project.name}`}>
          <span aria-hidden="true" className="flex h-full items-center justify-center text-2xl font-semibold text-disabled-text">
            {project.name.slice(0, 1).toUpperCase()}
          </span>
        </Link>
      ) : null}
      <div className={view === "grid" ? "flex flex-1 flex-col p-4" : "min-w-0 flex-1"}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">
              <Link href={`/projects/${project.id}`} className="hover:underline">
                {project.name}
              </Link>
            </h3>
            <p className="mt-0.5 truncate text-xs text-muted-text">
              {channel} · {project.contentType} · {project.platform}
            </p>
          </div>
          <div className="relative flex shrink-0 items-center">
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Delete ${project.name}`}
              title="Delete project"
              className="rounded-md p-1.5 text-muted-text hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={`Actions for ${project.name}`}
              aria-expanded={menu}
              onClick={() => setMenu((m) => !m)}
              className="rounded-md p-1.5 text-muted-text hover:bg-muted hover:text-foreground"
            >
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </button>
            {menu && (
              <>
                <span aria-hidden="true" onClick={() => setMenu(false)} className="fixed inset-0 z-10 cursor-default" />
                <div onClick={() => setMenu(false)} className="absolute right-0 top-full z-20 w-44 rounded-lg border border-border bg-elevated p-1 shadow-lg">
                  {actions}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <StatusBadge project={project} />
          <span className="text-xs text-muted-text">
            {stageLabel(project.currentStage)} · {timeAgo(project.updatedAt)}
          </span>
        </div>
        <div className="mt-3">
          <Progress value={progress} label={`${project.name} progress`} />
        </div>
        <Link
          href={`/projects/${project.id}`}
          className="mt-3 inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {continueLabelFor(project)}
        </Link>
      </div>
    </article>
  );
}
