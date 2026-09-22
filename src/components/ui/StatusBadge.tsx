import type { ReactNode } from "react";
import { cx } from "@/src/components/ui/cx";

/** Phase 1 API preserved; colors now come from design tokens. */
export function StatusBadge({
  tone = "blocked",
  children,
}: {
  tone?: "ok" | "pending" | "blocked";
  children: ReactNode;
}) {
  const tones = {
    ok: "border-success/30 bg-success/10 text-success",
    pending: "border-warning/30 bg-warning/10 text-warning",
    blocked: "border-border bg-muted text-muted-text",
  } as const;
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
