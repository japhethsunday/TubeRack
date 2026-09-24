"use client";

import { useState } from "react";
import { Captions } from "lucide-react";
import { transcribeWithProvider } from "@/src/lib/ai-client";
import { captionsFromSegments } from "@/src/lib/video/build";
import { Button } from "@/src/components/ui/Button";
import type { TimelineClip } from "@/src/lib/video/types";
import type { MediaAsset } from "@/src/lib/media/types";

/**
 * Word-timed captions from a real voice take: Gemini transcribes the stored
 * audio and the segments are placed on the captions track at the clip's
 * position, replacing captions inside that clip's span.
 */
export function GeminiCaptions({
  clips,
  assets,
  onCaptions,
}: {
  clips: TimelineClip[];
  assets: MediaAsset[];
  onCaptions: (next: TimelineClip[]) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const voiceClips = clips.filter((c) => {
    if (c.kind !== "voice" || !c.assetId) return false;
    const a = assets.find((x) => x.id === c.assetId);
    return a?.source === "provider-output" && a.status === "ready" && a.payload.startsWith("/api/v1/");
  });

  async function run(clip: TimelineClip) {
    const asset = assets.find((a) => a.id === clip.assetId);
    if (!asset) return;
    setBusy(clip.id);
    setMessage(null);
    const outcome = await transcribeWithProvider(asset.payload);
    setBusy(null);
    if (!outcome.ok) {
      setMessage({ ok: false, text: outcome.message });
      return;
    }
    const start = clip.startSec;
    const end = start + clip.durationSec;
    const kept = clips.filter((c) => !(c.kind === "captions" && c.startSec >= start && c.startSec < end));
    const added = captionsFromSegments(outcome.data.segments, start);
    onCaptions([...kept, ...added]);
    setMessage({ ok: true, text: `Added ${added.length} caption line(s) from “${clip.name}”.` });
  }

  return (
    <section aria-label="Captions from voice" className="auth-rise space-y-2 rounded-xl border border-border bg-surface p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Captions className="size-4 text-muted-text" aria-hidden="true" /> Captions from voice (Gemini)
      </h3>
      {voiceClips.length === 0 ? (
        <p className="text-xs text-muted-text">Add a Gemini voice take or an uploaded voice file to the timeline, then transcribe it into timed captions.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {voiceClips.slice(0, 6).map((c) => (
            <Button key={c.id} size="sm" variant="outline" loading={busy === c.id} disabled={busy !== null} onClick={() => void run(c)}>
              Transcribe “{c.name.slice(0, 24)}”
            </Button>
          ))}
        </div>
      )}
      {message && (
        <p role="status" className={`text-xs ${message.ok ? "text-success" : "text-destructive"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
