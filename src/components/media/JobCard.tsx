"use client";

import { useEffect, useState } from "react";
import { Ban, RotateCcw, CheckCircle2, OctagonX, Loader2 } from "lucide-react";
import { jobAction, type ClientJob } from "@/src/lib/jobs-client";
import { Progress } from "@/src/components/ui/feedback";
import { Button } from "@/src/components/ui/Button";

const LABEL: Record<ClientJob["status"], string> = {
  queued: "Queued",
  processing: "Processing",
  retrying: "Retrying",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

/** Live job status with real progress, cancel, and retry. Never simulates progress. */
export function JobCard({ job, onChange, title }: { job: ClientJob; onChange: (job: ClientJob) => void; title: string }) {
  const [busy, setBusy] = useState(false);
  const [waited, setWaited] = useState(0);

  useEffect(() => {
    if (job.status !== "queued") return;
    const created = new Date(job.created_at).getTime();
    const id = window.setInterval(() => setWaited(Math.round((Date.now() - created) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [job.status, job.created_at]);

  async function act(action: "cancel" | "retry") {
    setBusy(true);
    try {
      onChange(await jobAction(job.id, action));
    } finally {
      setBusy(false);
    }
  }

  const active = job.status === "queued" || job.status === "processing" || job.status === "retrying";
  return (
    <div className="auth-rise space-y-2 rounded-xl border border-border bg-surface p-3" role="status" aria-label={`${title}: ${LABEL[job.status]}`}>
      <p className="flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2 font-medium">
          {active && <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />}
          {job.status === "completed" && <CheckCircle2 className="size-4 text-success" aria-hidden="true" />}
          {(job.status === "failed" || job.status === "cancelled") && <OctagonX className="size-4 text-destructive" aria-hidden="true" />}
          {title}
        </span>
        <span className="text-xs text-muted-text">
          {job.provider} · {LABEL[job.status]}
          {job.attempts > 1 ? ` · attempt ${job.attempts}/${job.max_attempts}` : ""}
        </span>
      </p>
      {active && <Progress value={job.progress} label={`${LABEL[job.status]} — ${job.progress}%`} />}
      {job.status === "queued" && waited > 20 && (
        <p className="text-xs text-muted-text">Waiting for a worker to pick this up ({waited}s). Workers run on your self-hosted infrastructure.</p>
      )}
      {job.error && job.status !== "completed" && <p className="text-xs text-destructive">{job.error}</p>}
      <div className="flex gap-2">
        {active && (
          <Button size="sm" variant="outline" loading={busy} onClick={() => void act("cancel")}>
            <Ban className="size-3.5" aria-hidden="true" /> Cancel
          </Button>
        )}
        {(job.status === "failed" || job.status === "cancelled") && (
          <Button size="sm" variant="outline" loading={busy} onClick={() => void act("retry")}>
            <RotateCcw className="size-3.5" aria-hidden="true" /> Retry
          </Button>
        )}
      </div>
    </div>
  );
}
