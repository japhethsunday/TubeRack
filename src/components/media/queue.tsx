"use client";

import { RotateCcw } from "lucide-react";
import { useMedia } from "@/src/components/media/MediaProvider";
import { StatusBadge } from "@/src/components/media/library";
import { EmptyState } from "@/src/components/ui/states";
import { Button } from "@/src/components/ui/Button";

/**
 * Generation queue: active, failed (with retry), recently completed.
 * Local runs are fast, but the states mirror the Phase 11 async queue so
 * the UI contract is already correct.
 */
export function QueueView({
  projectId,
  onRetry,
  hasRerun,
}: {
  projectId: string;
  onRetry: (assetId: string) => void;
  hasRerun: (assetId: string) => boolean;
}) {
  const { assetsFor } = useMedia();
  const assets = assetsFor(projectId);
  const active = assets.filter((a) => ["pending", "preparing", "generating", "processing"].includes(a.status));
  const failed = assets.filter((a) => a.status === "failed");
  const recent = assets.filter((a) => a.status === "ready").slice(0, 5);

  if (active.length === 0 && failed.length === 0) {
    return (
      <EmptyState
        title="Queue is clear"
        body="Active generations, failures with retry, and recent completions appear here. Nothing runs in the background right now."
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <section aria-label="Active generations" className="rounded-xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold">Active ({active.length})</h3>
        {active.length === 0 ? (
          <p className="mt-1 text-xs text-muted-text">None running.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {active.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">{a.title}</span>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Failed generations" className="rounded-xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold">Failed ({failed.length})</h3>
        {failed.length === 0 ? (
          <p className="mt-1 text-xs text-muted-text">No failures. Retries rebuild from saved parameters.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {failed.map((a) => (
              <li key={a.id} className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                <p className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">{a.title}</span>
                  <StatusBadge status={a.status} />
                </p>
                {a.error && <p className="mt-0.5 text-xs text-destructive">{a.error}</p>}
                <div className="mt-1.5">
                  {hasRerun(a.id) ? (
                    <Button size="sm" variant="outline" onClick={() => onRetry(a.id)}>
                      <RotateCcw className="size-3.5" aria-hidden="true" />
                      Retry with same parameters
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-text">Parameters expired with the session — recreate in its studio.</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Recently completed" className="rounded-xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold">Recently ready</h3>
        {recent.length === 0 ? (
          <p className="mt-1 text-xs text-muted-text">Nothing completed yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {recent.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">{a.title}</span>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
