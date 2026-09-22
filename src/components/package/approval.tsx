"use client";

import { Check, Eye, Flag } from "lucide-react";
import type { ApprovalStage } from "@/src/lib/package/types";
import { Badge } from "@/src/components/ui/Badge";
import { cx } from "@/src/components/ui/cx";

const ORDER: ApprovalStage[] = ["draft", "review", "approved", "ready"];

const LABELS: Record<ApprovalStage, string> = {
  draft: "Draft",
  review: "In review",
  approved: "Approved",
  ready: "Ready",
};

/**
 * Approval lifecycle: draft → review → approved → ready.
 * Approval never publishes anything — it only marks readiness.
 */
export function ApprovalFlow({
  status,
  onChange,
  compact,
}: {
  status: ApprovalStage;
  onChange: (next: ApprovalStage) => void;
  compact?: boolean;
}) {
  const idx = ORDER.indexOf(status);
  return (
    <div className={cx("flex flex-wrap items-center gap-1.5", compact ? "" : "rounded-lg border border-border p-2.5")}>
      {!compact && (
        <span className="text-xs font-medium text-muted-text">Approval:</span>
      )}
      <ol className="flex items-center gap-1" aria-label="Approval progress">
        {ORDER.map((stage, i) => (
          <li key={stage} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden="true" className="text-disabled-text">→</span>}
            <button
              type="button"
              disabled={i > idx + 1 || (i === idx && idx === ORDER.length - 1)}
              onClick={() => onChange(stage)}
              aria-current={i === idx ? "step" : undefined}
              title={
                i <= idx
                  ? `Return to ${LABELS[stage]}`
                  : i === idx + 1
                    ? `Advance to ${LABELS[stage]}`
                    : `Complete earlier stages first`
              }
              className={cx(
                "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
                i < idx && "bg-muted text-muted-text hover:text-foreground",
                i === idx && "bg-primary text-primary-foreground",
                i > idx && "border border-border text-muted-text hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {LABELS[stage]}
            </button>
          </li>
        ))}
      </ol>
      {status === "ready" && (
        <Badge tone="ok">
          <Check className="size-3" aria-hidden="true" />
          Ready — not published
        </Badge>
      )}
      {status === "review" && (
        <Badge tone="info">
          <Eye className="size-3" aria-hidden="true" />
          Awaiting your review
        </Badge>
      )}
      {status === "draft" && (
        <Badge tone="neutral">
          <Flag className="size-3" aria-hidden="true" />
          Work in progress
        </Badge>
      )}
    </div>
  );
}
