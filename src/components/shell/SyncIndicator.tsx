"use client";

import { useSyncExternalStore } from "react";
import { CloudOff } from "lucide-react";
import { onSyncStatus, syncStatus } from "@/src/lib/sync";

/** Header chip: visible only when changes can't be saved (offline or too large). */
export function SyncIndicator() {
  const status = useSyncExternalStore(onSyncStatus, syncStatus, () => "idle" as const);
  if (status === "idle") return null;
  if (status === "too-large") {
    return (
      <span role="alert" title="Some changes are too large to save to your account (usually many uploaded thumbnail images). They're kept on this device." className="hidden items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive sm:inline-flex">
        <CloudOff className="size-3.5" aria-hidden="true" /> Some changes not synced
      </span>
    );
  }
  // Normal saving happens quietly in the background; only problems are shown.
  if (status !== "retrying") return null;
  return (
    <span
      role="status"
      title="Couldn't reach the server — your changes are safe on this device and will keep retrying."
      className="ui-panel hidden items-center gap-1.5 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning sm:inline-flex"
    >
      <CloudOff className="size-3.5" aria-hidden="true" />
      Offline — retrying
    </span>
  );
}
