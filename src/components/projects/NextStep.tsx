"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { PROJECT_STAGES, type ProjectStage } from "@/src/types/domain";
import { nextStage, stageAt, stageHref } from "@/src/lib/projects/stages";
import { stageLabel } from "@/src/lib/projects/storage";
import { useProjects } from "@/src/components/projects/ProjectsProvider";
import { cx } from "@/src/components/ui/cx";

/** Hook: current project + stage for this page, and a "done → next" action. */
export function useNextStep(projectId: string | null, stageOverride?: ProjectStage) {
  const pathname = usePathname();
  const tab = useSearchParams().get("tab");
  const router = useRouter();
  const { projects, setStage } = useProjects();
  const project = projectId ? projects.find((p) => p.id === projectId) ?? null : null;
  const stage = stageOverride ?? stageAt(pathname, tab);
  if (!project || !stage) return null;
  const next = nextStage(stage);
  return {
    project,
    stage,
    next,
    done: project.stages[stage] === "complete",
    advance: () => {
      setStage(project.id, stage, "complete");
      if (next) {
        if (project.stages[next] === "not-started") setStage(project.id, next, "in-progress");
        router.push(stageHref(next, project.id));
      } else {
        router.push(`/projects/${project.id}`);
      }
    },
  };
}

function Bar() {
  const projectId = useSearchParams().get("project");
  const step = useNextStep(projectId);
  if (!step) return null;
  const n = PROJECT_STAGES.indexOf(step.stage) + 1;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm" role="navigation" aria-label="Project workflow">
      <span className="flex min-w-0 flex-1 items-center gap-2">
        {step.done ? <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" /> : <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />}
        <span className="truncate">
          <span className="font-medium">{stageLabel(step.stage)}</span>
          <span className="text-muted-text"> · step {n} of {PROJECT_STAGES.length} · </span>
          <Link href={`/projects/${step.project.id}`} className="text-muted-text underline-offset-2 hover:text-foreground hover:underline">{step.project.name}</Link>
        </span>
      </span>
      <button
        type="button"
        onClick={step.advance}
        className={cx("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-opacity hover:opacity-90", "bg-primary text-primary-foreground")}
      >
        {step.next ? <>{step.done ? "Continue to" : "Mark done & continue to"} {stageLabel(step.next)} <ArrowRight className="size-3.5" aria-hidden="true" /></> : <>Mark done · back to project</>}
      </button>
    </div>
  );
}

/** Workflow bar for pages opened with ?project= (renders nothing otherwise). */
export function NextStepBar() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
