"use client";

import { useSyncExternalStore } from "react";
import { CloudUpload, CloudOff } from "lucide-react";
import { onSyncStatus, syncStatus } from "@/src/lib/sync";

/** Header chip: visible only while changes are saving or retrying. */
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
  const retrying = status === "retrying";
  return (
    <span
      role="status"
      title={retrying ? "Couldn't reach the server — your changes are safe on this device and will keep retrying." : "Saving to your account…"}
      className={`ui-panel hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex ${retrying ? "bg-warning/15 text-warning" : "bg-muted text-muted-text"}`}
    >
      {retrying ? <CloudOff className="size-3.5" aria-hidden="true" /> : <CloudUpload className="size-3.5 animate-pulse" aria-hidden="true" />}
      {retrying ? "Offline — retrying" : "Saving…"}
    </span>
  );
}
