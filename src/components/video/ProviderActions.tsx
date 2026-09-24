"use client";

import { useState } from "react";
import { Captions, Clapperboard, Download } from "lucide-react";
import { queueJob, useJob, jobErrorText, useProviderRegistry, type ClientJob } from "@/src/lib/jobs-client";
import { captionsFromSegments } from "@/src/lib/video/build";
import { JobCard } from "@/src/components/media/JobCard";
import { Button } from "@/src/components/ui/Button";
import type { TimelineClip, Composition } from "@/src/lib/video/types";
import type { MediaAsset } from "@/src/lib/media/types";

function TrackedJob({ jobId, title, onDone }: { jobId: string; title: string; onDone: (job: ClientJob) => void }) {
  const { job, setJob } = useJob(jobId, onDone);
  return job ? <JobCard job={job} title={title} onChange={setJob} /> : null;
}

/**
 * Server-side actions for the Video Studio, shown only when their provider
 * is configured and healthy: WhisperX captions from a stored voice take,
 * and a full render through the rendering provider (Rendiv).
 */
export function ProviderActions({
  projectId,
  composition,
  clips,
  assets,
  onCaptions,
}: {
  projectId: string;
  composition: Composition;
  clips: TimelineClip[];
  assets: MediaAsset[];
  onCaptions: (next: TimelineClip[]) => void;
}) {
  const { usable } = useProviderRegistry();
  const [captionJob, setCaptionJob] = useState<{ id: string; clip: TimelineClip } | null>(null);
  const [renderJob, setRenderJob] = useState<string | null>(null);
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const voiceClips = clips.filter((c) => {
    if (c.kind !== "voice" || !c.assetId) return false;
    const a = assets.find((x) => x.id === c.assetId);
    return a?.source === "provider-output" && a.status === "ready";
  });
  const canCaption = usable("whisperx");
  const canRender = usable("rendiv");

  async function transcribe(clip: TimelineClip) {
    const asset = assets.find((a) => a.id === clip.assetId);
    if (!asset) return;
    setError(null);
    try {
      const job = await queueJob("transcription", { file: asset.payload }, projectId);
      setCaptionJob({ id: job.id, clip });
    } catch (e) {
      setError(jobErrorText(e));
    }
  }

  async function render() {
    setError(null);
    setRenderUrl(null);
    try {
      const resolved = {
        ...composition,
        clips: composition.clips.map((c) => {
          const a = c.assetId ? assets.find((x) => x.id === c.assetId) : undefined;
          return a?.source === "provider-output" ? { ...c, src: a.payload, mime: a.mime } : c;
        }),
      };
      const job = await queueJob("render", { composition: resolved, format: "mp4" }, projectId);
      setRenderJob(job.id);
    } catch (e) {
      setError(jobErrorText(e));
    }
  }

  return (
    <section aria-label="Server processing" className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold">Server processing</h3>

      <div className="space-y-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Captions className="size-4 text-muted-text" aria-hidden="true" /> Captions from voice (WhisperX)
        </p>
        {!canCaption ? (
          <p className="text-xs text-muted-text">Transcription is not configured (WHISPERX_URL).</p>
        ) : voiceClips.length === 0 ? (
          <p className="text-xs text-muted-text">Add a generated or uploaded voice take to the timeline first.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {voiceClips.slice(0, 4).map((c) => (
              <Button key={c.id} size="sm" variant="outline" onClick={() => void transcribe(c)} disabled={Boolean(captionJob)}>
                Transcribe “{c.name.slice(0, 24)}”
              </Button>
            ))}
          </div>
        )}
        {captionJob && (
          <TrackedJob
            jobId={captionJob.id}
            title="Transcription"
            onDone={(job) => {
              if (job.status === "completed") {
                const segments = (job.output.segments ?? []) as { startSec: number; endSec: number; text: string }[];
                const start = captionJob.clip.startSec;
                const end = start + captionJob.clip.durationSec;
                const kept = clips.filter((c) => !(c.kind === "captions" && c.startSec >= start && c.startSec < end));
                onCaptions([...kept, ...captionsFromSegments(segments, start)]);
              }
              setCaptionJob(null);
            }}
          />
        )}
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Clapperboard className="size-4 text-muted-text" aria-hidden="true" /> Render video (Rendiv)
        </p>
        {!canRender ? (
          <p className="text-xs text-muted-text">Server rendering is not configured (RENDIV_URL). Save a render request instead.</p>
        ) : (
          <Button size="sm" onClick={() => void render()} disabled={Boolean(renderJob)}>
            Render MP4
          </Button>
        )}
        {renderJob && (
          <TrackedJob
            jobId={renderJob}
            title="Render"
            onDone={(job) => {
              const url = (job.output as { url?: string }).url;
              if (job.status === "completed" && url) setRenderUrl(url);
              setRenderJob(null);
            }}
          />
        )}
        {renderUrl && (
          <a href={renderUrl} className="inline-flex items-center gap-1.5 text-sm font-medium underline" download>
            <Download className="size-4" aria-hidden="true" /> Download render
          </a>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </section>
  );
}
