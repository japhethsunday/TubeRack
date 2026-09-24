"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Download, Upload, Layers } from "lucide-react";
import { useProjects, LocalStorageNote } from "@/src/components/projects/ProjectsProvider";
import { useScripts, ScriptStorageNote } from "@/src/components/script/ScriptProvider";
import { useIntelQuery } from "@/src/components/intelligence/chrome";
import { SceneCard } from "@/src/components/script/SceneCard";
import { Breadcrumb } from "@/src/components/ui/data";
import { Button } from "@/src/components/ui/Button";
import { EmptyState, ErrorState } from "@/src/components/ui/states";
import { LoadingState } from "@/src/components/ui/feedback";
import { Modal } from "@/src/components/ui/overlays";
import { formatDuration } from "@/src/lib/script/measure";
import { scenesFromSections, sceneNeedsReview, markSceneSynced, blankScene } from "@/src/lib/script/engine";
import { cx } from "@/src/components/ui/cx";

export default function StoryboardPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading Storyboard" />}>
      <Board />
    </Suspense>
  );
}

function Board() {
  const { projectId } = useIntelQuery();
  const { ready: projectsReady, projects, channelName } = useProjects();
  const scripts = useScripts();
  const [selectedId, setSelectedId] = useState<string | null>(projectId);
  const [confirmRebuild, setConfirmRebuild] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const ready = projectsReady && scripts.ready;
  const project = projects.find((p) => p.id === (selectedId ?? projectId));

  if (!ready) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <LoadingState label="Loading Storyboard" />
      </div>
    );
  }

  if (!project) {
    const active = projects.filter((p) => p.status !== "archived");
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <Breadcrumb trail={[{ label: "Dashboard", href: "/dashboard" }, { label: "Storyboard" }]} />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Storyboard</h1>
          <p className="mt-1 text-sm text-muted-text">Select a project to plan its scenes.</p>
        </div>
        {active.length === 0 ? (
          <EmptyState title="No projects yet" body="Scenes belong to project scripts. Create a project first." />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2" aria-label="Choose a project">
            {active.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className="w-full rounded-xl border border-border bg-surface p-4 text-left hover:border-muted-text/50"
                >
                  <span className="block text-sm font-medium">{p.name}</span>
                  <span className="block text-xs text-muted-text">{channelName(p.channelId)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const script = scripts.scriptFor(project.id);
  const scenes = scripts.scenesFor(project.id);
  const pid = project.id;
  const totalSec = scenes.reduce((n, s) => n + s.durationSec, 0);
  const stale = script ? scenes.filter((s) => sceneNeedsReview(s, script.sections)).length : 0;

  function rebuild() {
    if (!script) return;
    scripts.putScenes(pid, scenesFromSections(script.sections, script.wpm));
    setConfirmRebuild(false);
    setNotice(`Rebuilt ${script.sections.length} scene(s) from the current script. Previous scene work was replaced.`);
  }

  function addBlankScene() {
    const numbered = scenes.map((s, i) => ({ ...s, number: i + 1 }));
    scripts.putScenes(pid, [...numbered, blankScene(numbered.length + 1)]);
  }

  function doExport() {
    const blob = new Blob([JSON.stringify(scripts.exportBundle(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tuberack-scripts.json";
    a.click();
    URL.revokeObjectURL(url);
    setNotice("Exported scripts, boards, loops, and versions.");
  }

  async function doImport(file: File) {
    setImportError(null);
    try {
      const data = JSON.parse(await file.text());
      const result = scripts.importBundle(data);
      setNotice(`Imported ${result.scripts} script(s). Existing device scripts were kept.`);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Could not read that file.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Breadcrumb trail={[{ label: "Projects", href: "/projects" }, { label: project.name, href: `/projects/${project.id}` }, { label: "Storyboard" }]} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Storyboard — {project.name}</h1>
          <p className="mt-0.5 text-xs text-muted-text">
            {scenes.length} scene(s) · ~{formatDuration(totalSec)} estimated
            {stale > 0 && <span className="font-medium text-warning"> · {stale} need review</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/studio/script?project=${project.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium hover:bg-muted">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Script Studio
          </Link>
          <button type="button" onClick={doExport} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium hover:bg-muted">
            <Download className="size-4" aria-hidden="true" />
            Export
          </button>
          <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium hover:bg-muted">
            <Upload className="size-4" aria-hidden="true" />
            Import
            <input type="file" accept="application/json" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = ""; }} />
          </label>
        </div>
      </div>

      {notice && (
        <p role="status" className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm">{notice}</p>
      )}
      {importError && (
        <ErrorState title="Import failed" body={importError} onRetry={() => setImportError(null)} recoveryHref={`/studio/storyboard?project=${project.id}`} recoveryLabel="Back to board" />
      )}

      {!script ? (
        <EmptyState
          icon={Layers}
          title="No script yet"
          body="Scenes map from script sections. Write the script first — then build the board in one click."
          action={
            <Link href={`/studio/script?project=${project.id}`} className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
              Open Script Studio
            </Link>
          }
        />
      ) : scenes.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Board is empty"
          body={`${script.sections.length} script section(s) are ready to become scenes — one scene per section, with timing from your speaking rate.`}
          action={
            <Button onClick={rebuild}>
              <Plus className="size-4" aria-hidden="true" />
              Build {script.sections.length} scenes from script
            </Button>
          }
        />
      ) : (
        <>
          <div>
            <p className="text-xs font-medium text-muted-text" id="timeline-label">Sequence timeline</p>
            <div className="mt-1.5 flex gap-1" role="img" aria-labelledby="timeline-label" aria-label={`${scenes.length} scenes, ${formatDuration(totalSec)} total`}>
              {scenes.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => document.getElementById(`scene-${s.id}`)?.scrollIntoView({ block: "center" })}
                  title={`Scene ${s.number}: ${s.title} (~${formatDuration(s.durationSec)})`}
                  aria-label={`Go to scene ${s.number}: ${s.title}`}
                  style={{ flexGrow: Math.max(1, s.durationSec), flexBasis: 0 }}
                  className={cx(
                    "h-9 min-w-8 truncate rounded-md px-1 text-[11px] font-medium transition-colors",
                    sceneNeedsReview(s, script.sections) ? "bg-warning/30 hover:bg-warning/40" : "bg-muted hover:bg-border",
                  )}
                >
                  {s.number}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={addBlankScene}
            >
              <Plus className="size-4" aria-hidden="true" />
              Blank scene
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmRebuild(true)}>
              Rebuild from script…
            </Button>
          </div>

          <div className="space-y-3">
            {scenes.map((s, i) => (
              <SceneCard
                key={s.id}
                scene={s}
                index={i}
                total={scenes.length}
                needsReview={sceneNeedsReview(s, script.sections)}
                onPatch={(patch) => scripts.updateScene(pid, s.id, patch)}
                onMove={(dir) => {
                  const j = i + dir;
                  if (j < 0 || j >= scenes.length) return;
                  const next = [...scenes];
                  [next[i], next[j]] = [next[j], next[i]];
                  scripts.putScenes(pid, next.map((x, k) => ({ ...x, number: k + 1 })));
                }}
                onDelete={() =>
                  scripts.putScenes(pid, scenes.filter((x) => x.id !== s.id).map((x, k) => ({ ...x, number: k + 1 })))
                }
                onSync={() => scripts.updateScene(pid, s.id, markSceneSynced(s, script.sections))}
              />
            ))}
          </div>
        </>
      )}

      <LocalStorageNote compact />
      <ScriptStorageNote />

      {confirmRebuild && (
        <Modal title="Rebuild scenes?" description="This replaces every scene on this board." onClose={() => setConfirmRebuild(false)}>
          <p className="text-sm text-muted-text">
            Visual direction, narration edits, shot choices, and notes on the current{" "}
            {scenes.length} scene(s) will be destroyed. The script itself is untouched.
            Boards have no version history — export first if the work matters.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmRebuild(false)}>
              Keep scenes
            </Button>
            <Button variant="destructive" onClick={rebuild}>
              Rebuild {script?.sections.length ?? 0} scenes
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
