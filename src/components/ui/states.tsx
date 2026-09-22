import { Inbox, RefreshCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/src/components/ui/Button";

/**
 * Intentional empty state: what the area is for, why it matters, next step.
 * The action must navigate somewhere real or be honestly disabled.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  body,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-muted">
        <Icon className="size-5 text-muted-text" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-sm font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-text">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/**
 * Specific error state: what failed, context, retry, safe recovery.
 * Never a bare "Something went wrong."
 */
export function ErrorState({
  title,
  body,
  onRetry,
  recoveryHref = "/dashboard",
  recoveryLabel = "Back to dashboard",
}: {
  title: string;
  body: string;
  onRetry?: () => void;
  recoveryHref?: string;
  recoveryLabel?: string;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center"
    >
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-text">{body}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Retry
          </Button>
        )}
        <a
          href={recoveryHref}
          className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-muted-text hover:bg-muted hover:text-foreground"
        >
          {recoveryLabel}
        </a>
      </div>
    </div>
  );
}
