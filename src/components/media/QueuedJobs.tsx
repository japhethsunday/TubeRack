"use client";

import { useState } from "react";
import { queueJob, useJob, jobErrorText, type JobType } from "@/src/lib/jobs-client";
import { useMedia } from "@/src/components/media/MediaProvider";
import { JobCard } from "@/src/components/media/JobCard";
import { Alert } from "@/src/components/ui/Alert";
import type { MediaAsset } from "@/src/lib/media/types";

type AssetDraft = Omit<MediaAsset, "id" | "createdAt" | "updatedAt" | "status" | "source" | "payload">;

interface Tracked {
  jobId: string;
  assetId: string;
  title: string;
}

function Watcher({ item }: { item: Tracked }) {
  const { updateAsset } = useMedia();
  const { job, setJob } = useJob(item.jobId, (settled) => {
    if (settled.status === "completed") {
      const out = settled.output as { url?: string; mime?: string };
      if (out.url) updateAsset(item.assetId, { status: "ready", payload: out.url, mime: out.mime ?? "" });
      else updateAsset(item.assetId, { status: "failed", error: "The job finished without a file." });
    } else {
      updateAsset(item.assetId, { status: settled.status === "cancelled" ? "cancelled" : "failed", error: settled.error ?? undefined });
    }
  });
  if (!job) return null;
  return (
    <JobCard
      job={job}
      title={item.title}
      onChange={(next) => {
        setJob(next);
        if (next.status === "retrying") updateAsset(item.assetId, { status: "generating", error: undefined });
      }}
    />
  );
}

/**
 * Queue provider work as a job and track it into the asset library:
 * the asset exists immediately (status "generating") and becomes a stored
 * file when the worker completes — or failed/cancelled with the reason.
 */
export function useQueuedJobs(projectId: string) {
  const { addAsset } = useMedia();
  const [items, setItems] = useState<Tracked[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  async function start(type: JobType, input: Record<string, unknown>, draft: AssetDraft) {
    setStarting(true);
    setError(null);
    try {
      const job = await queueJob(type, input, projectId);
      const asset = addAsset({ ...draft, source: "provider-output", status: "generating", payload: "" });
      setItems((prev) => [{ jobId: job.id, assetId: asset.id, title: draft.title }, ...prev].slice(0, 6));
    } catch (e) {
      setError(jobErrorText(e));
    } finally {
      setStarting(false);
    }
  }

  const view = (
    <div className="space-y-2">
      {error && (
        <Alert tone="warn" title="Could not start">
          {error}
        </Alert>
      )}
      {items.map((item) => (
        <Watcher key={item.jobId} item={item} />
      ))}
    </div>
  );

  return { start, starting, view };
}
