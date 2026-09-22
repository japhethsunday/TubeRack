import { CheckCircle2, Circle, Loader2, CircleDashed } from "lucide-react";
import type { PreviewStageProgress, PreviewStageState } from "@/src/config/preview";
import { Badge } from "@/src/components/ui/Badge";
import { cx } from "@/src/components/ui/cx";

const icons: Record<PreviewStageState, typeof CheckCircle2> = {
  complete: CheckCircle2,
  "in-progress": Loader2,
  "not-started": CircleDashed,
};

/**
 * Project progress tracker (visual foundation). Renders static preview data
 * labeled as Preview — real per-project state arrives with Phase 4 + 11.
 */
export function ProjectProgress({ items }: { items: PreviewStageProgress[] }) {
  const done = items.filter((i) => i.state === "complete").length;
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Project progress</h3>
        <Badge tone="preview">Preview</Badge>
      </div>
      <p className="mt-1 text-xs text-muted-text" aria-live="polite">
        {done} of {items.length} stages complete
      </p>
      <ol className="mt-3 space-y-1" aria-label="Stage progress">
        {items.map((item) => {
          const Icon = item.state === "not-started" ? Circle : icons[item.state];
          return (
            <li
              key={item.stage}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm"
            >
              <Icon
                aria-hidden="true"
                className={cx(
                  "size-4 shrink-0",
                  item.state === "complete" && "text-success",
                  item.state === "in-progress" && "animate-spin text-info",
                  item.state === "not-started" && "text-disabled-text",
                )}
              />
              <span className={item.state === "not-started" ? "text-muted-text" : ""}>
                {item.label}
              </span>
              <span className="sr-only">— {item.state.replace("-", " ")}</span>
              <span aria-hidden="true" className="ml-auto text-xs capitalize text-muted-text">
                {item.state === "in-progress" ? "In progress" : item.state === "not-started" ? "Not started" : "Complete"}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
