import type { ReactNode } from "react";
import { spacing } from "@/src/design/tokens";
import { cx } from "@/src/components/ui/cx";

export function Section({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className={spacing.sectionGap}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {description && (
            <p className="mt-1 max-w-prose text-sm text-muted-text">{description}</p>
          )}
        </div>
        {actions}
      </div>
      <div>{children}</div>
    </section>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div>
      <p className="text-sm text-muted-text">{body}</p>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-10 rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          autoFocus
          className="h-10 rounded-lg bg-destructive px-4 text-sm font-medium text-white hover:opacity-90 dark:text-black"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
