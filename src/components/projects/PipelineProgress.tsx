import { CheckCircle2, CircleDashed, Loader2 } from "lucide-react";
import { PROJECT_STAGES, type ProjectStage } from "@/src/types/domain";
import type { StageState } from "@/src/lib/projects/types";
import { stageLabel } from "@/src/lib/projects/storage";
import { cx } from "@/src/components/ui/cx";

/** Real pipeline visualization driven by project stage states. */
export function PipelineProgress({
  stages,
  current,
}: {
  stages: Record<ProjectStage, StageState>;
  current: ProjectStage;
}) {
  return (
    <ol aria-label="Production pipeline" className="space-y-1">
      {PROJECT_STAGES.map((stage) => {
        const state = stages[stage];
        const Icon = state === "complete" ? CheckCircle2 : state === "in-progress" ? Loader2 : CircleDashed;
        return (
          <li
            key={stage}
            aria-current={stage === current ? "step" : undefined}
            className={cx(
              "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm",
              stage === current && "bg-muted font-medium",
            )}
          >
            <Icon
              aria-hidden="true"
              className={cx(
                "size-4 shrink-0",
                state === "complete" && "text-success",
                state === "in-progress" && "animate-spin text-info",
                state === "not-started" && "text-disabled-text",
              )}
            />
            <span className={state === "not-started" ? "text-muted-text" : ""}>{stageLabel(stage)}</span>
            <span className="sr-only">— {state.replace("-", " ")}</span>
          </li>
        );
      })}
    </ol>
  );
}
