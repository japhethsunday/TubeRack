"use client";

import { useMemo, useState } from "react";
import { FolderKanban } from "lucide-react";
import { useProjects, LocalStorageNote } from "@/src/components/projects/ProjectsProvider";
import { NewProjectButton } from "@/src/components/projects/NewProjectDialog";
import { ProjectCard } from "@/src/components/projects/ProjectCard";
import { ProjectsToolbar } from "@/src/components/projects/ProjectsToolbar";
import { filterProjects, sortProjects } from "@/src/lib/projects/store";
import type { ProjectFilter, ProjectSort } from "@/src/lib/projects/types";
import { EmptyState, ErrorState } from "@/src/components/ui/states";
import { Breadcrumb } from "@/src/components/ui/data";
import { Modal, Drawer } from "@/src/components/ui/overlays";
import { ConfirmDialog } from "@/src/components/ui/Section";
import { Input } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { LoadingState } from "@/src/components/ui/feedback";
import { Badge } from "@/src/components/ui/Badge";
import { cx } from "@/src/components/ui/cx";

/** Project index: search, filter, sort, grid/list, archive, import/export. */
export default function ProjectsPage() {
  const {
    ready,
    projects,
    channels,
    channelName,
    rename,
    duplicate,
    archive,
    restore,
    remove,
    exportBundle,
    importBundle,
  } = useProjects();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProjectFilter>("all");
  const [sort, setSort] = useState<ProjectSort>("recent");
  const [channelId, setChannelId] = useState("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const shown = useMemo(
    () => sortProjects(filterProjects(projects, query, filter, channelId), sort),
    [projects, query, filter, channelId, sort],
  );

  if (!ready) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <LoadingState label="Loading projects" />
      </div>
    );
  }

  function doExport() {
    const blob = new Blob([JSON.stringify(exportBundle(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tuberack-workspace.json";
    a.click();
    URL.revokeObjectURL(url);
    setNotice(`Exported ${projects.length} project(s) and ${channels.length} channel(s).`);
  }

  async function doImport(file: File) {
    setImportError(null);
    try {
      const data = JSON.parse(await file.text());
      const result = importBundle(data);
      setNotice(`Imported ${result.projects} project(s), ${result.channels} new channel(s).`);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Could not read that file.");
    }
  }

  const renamingProject = renaming ? projects.find((p) => p.id === renaming) : undefined;
  const deletingProject = deleting ? projects.find((p) => p.id === deleting) : undefined;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Breadcrumb trail={[{ label: "Dashboard", href: "/dashboard" }, { label: "Projects" }]} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Projects{" "}
            <span className="text-base font-normal text-muted-text">
              ({shown.length} shown)
            </span>
          </h1>
          <p className="mt-1 text-sm text-muted-text">
            One project carries an idea from research to published video and back into strategy.
          </p>
        </div>
        <NewProjectButton label="New project" />
      </div>
      <LocalStorageNote compact />

      {notice && (
        <p role="status" className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm">
          {notice}
        </p>
      )}
      {importError && (
        <div className="max-w-2xl">
          <ErrorState
            title="Import failed"
            body={importError}
            onRetry={() => setImportError(null)}
            recoveryHref="/projects"
            recoveryLabel="Back to projects"
          />
        </div>
      )}

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          body="Create your first project — name, channel, topic, and goal. It appears here instantly and syncs to your account when you are signed in."
          action={<NewProjectButton label="Create your first project" />}
        />
      ) : (
        <>
          <ProjectsToolbar
            query={query}
            onQuery={setQuery}
            filter={filter}
            onFilter={setFilter}
            sort={sort}
            onSort={setSort}
            channelId={channelId}
            onChannel={setChannelId}
            channels={channels}
            view={view}
            onView={setView}
            onExport={doExport}
            onImport={doImport}
          />
          {shown.length === 0 ? (
            <EmptyState
              title="No projects match"
              body="Try a different search, channel, or status filter — archived projects hide unless selected."
            />
          ) : (
            <ul
              aria-label="Projects"
              className={cx(view === "grid" ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3" : "space-y-3")}
            >
              {shown.map((p) => (
                <li key={p.id}>
                  {view === "grid" ? (
                    <ProjectCard
                      project={p}
                      channel={channelName(p.channelId)}
                      view="grid"
                      onRename={() => {
                        setRenaming(p.id);
                        setRenameValue(p.name);
                      }}
                      onDuplicate={() => duplicate(p.id)}
                      onArchive={() => archive(p.id)}
                      onRestore={() => restore(p.id)}
                      onDelete={() => setDeleting(p.id)}
                    />
                  ) : (
                    <ProjectCard
                      project={p}
                      channel={channelName(p.channelId)}
                      view="list"
                      onRename={() => {
                        setRenaming(p.id);
                        setRenameValue(p.name);
                      }}
                      onDuplicate={() => duplicate(p.id)}
                      onArchive={() => archive(p.id)}
                      onRestore={() => restore(p.id)}
                      onDelete={() => setDeleting(p.id)}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
          {filter === "archived" && (
            <p className="flex items-center gap-2 text-xs text-muted-text">
              Archived projects are read-only history until restored.
              <Badge tone="neutral">{shown.length} archived</Badge>
            </p>
          )}
        </>
      )}

      {renamingProject && (
        <Modal title="Rename project" onClose={() => setRenaming(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!renameValue.trim()) return;
              rename(renamingProject.id, renameValue);
              setRenaming(null);
            }}
            className="space-y-4"
          >
            <Input label="Project name" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setRenaming(null)}>
                Cancel
              </Button>
              <Button type="submit">Rename</Button>
            </div>
          </form>
        </Modal>
      )}

      {deletingProject && (
        <Drawer title="Delete project?" description="Deletes it from your account on every device." onClose={() => setDeleting(null)}>
          <ConfirmDialog
            title="Delete project?"
            body={`“${deletingProject.name}” — its script, storyboard, timeline, media and progress — will be deleted from your account on every device. This cannot be undone.`}
            confirmLabel="Delete forever"
            onConfirm={() => {
              remove(deletingProject.id);
              setDeleting(null);
            }}
            onCancel={() => setDeleting(null)}
          />
        </Drawer>
      )}
    </div>
  );
}
