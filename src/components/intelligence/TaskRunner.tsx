"use client";

import { useRef, useState } from "react";
import { Play, RotateCcw, Ban, CheckCircle2, OctagonX } from "lucide-react";
import type { GenerationStatus, IntelligenceTaskType } from "@/src/lib/intelligence/tasks";
import { INTELLIGENCE_TASK_DEFS } from "@/src/lib/intelligence/tasks";
import { Button } from "@/src/components/ui/Button";
import { Progress } from "@/src/components/ui/feedback";
import { Badge } from "@/src/components/ui/Badge";

const PHASE_LABEL: Record<GenerationStatus, string> = {
  idle: "Ready",
  preparing: "Assembling context",
  generating: "Running local analysis",
  completed: "Complete",
  failed: "Failed",
  cancelled: "Cancelled",
};

/**
 * Unified AI-action runner with the full generation lifecycle:
 * idle → preparing → generating → completed | failed | cancelled.
 * Executes a synchronous local analyzer between cancellable steps so every
 * state is real. Providers plug into the same states in Phase 11.
 */
export function TaskRunner<T>({
  task,
  contextSummary,
  idleHint,
  work,
  onCompleted,
  children,
}: {
  task: IntelligenceTaskType;
  contextSummary: string;
  idleHint: string;
  work: () => T;
  onCompleted: (result: T) => void;
  children: (result: T | null) => React.ReactNode;
}) {
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const def = INTELLIGENCE_TASK_DEFS[task];

  const pause = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

  async function start() {
    cancelRef.current = false;
    setError(null);
    setStatus("preparing");
    setProgress(10);
    await pause(220);
    if (cancelRef.current) {
      setStatus("cancelled");
      return;
    }
    setStatus("generating");
    setProgress(40);
    await pause(160);
    if (cancelRef.current) {
      setStatus("cancelled");
      return;
    }
    try {
      const out = work();
      if (cancelRef.current) {
        setStatus("cancelled");
        return;
      }
      setResult(out);
      setProgress(100);
      setStatus("completed");
      onCompleted(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed.");
      setStatus("failed");
    }
  }

  const active = status === "preparing" || status === "generating";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm">
          <Badge tone="neutral">{def.label}</Badge>
          <span aria-live="polite" className="text-xs text-muted-text">
            {PHASE_LABEL[status]}
            {status === "generating" ? ` — ${progress}%` : ""}
          </span>
        </p>
        <Badge tone="preview">Local analysis</Badge>
      </div>

      <p className="text-xs text-muted-text">Input: {contextSummary}</p>

      {status === "idle" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-text">{idleHint}</p>
          <Button onClick={start}>
            <Play className="size-4" aria-hidden="true" />
            Run analysis
          </Button>
        </div>
      )}

      {active && (
        <div className="space-y-3">
          <Progress value={progress} label={PHASE_LABEL[status]} />
          <Button variant="outline" size="sm" onClick={() => { cancelRef.current = true; }}>
            <Ban className="size-4" aria-hidden="true" />
            Cancel
          </Button>
        </div>
      )}

      {status === "completed" && (
        <div className="space-y-3">
          <p role="status" className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Analysis complete — review, edit, and save what is useful.
          </p>
          {children(result)}
          <Button variant="outline" size="sm" onClick={start}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Run again
          </Button>
        </div>
      )}

      {(status === "failed" || status === "cancelled") && (
        <div className="space-y-3">
          <p role={status === "failed" ? "alert" : "status"} className="flex items-center gap-2 text-sm">
            <OctagonX className="size-4 text-destructive" aria-hidden="true" />
            {status === "failed"
              ? `Analysis failed: ${error ?? "unknown error"}. Your input is intact — retry when ready.`
              : "Cancelled. Nothing was saved."}
          </p>
          <Button variant="outline" size="sm" onClick={start}>
            <RotateCcw className="size-4" aria-hidden="true" />
            {status === "failed" ? "Retry" : "Run again"}
          </Button>
        </div>
      )}
    </div>
  );
}
