"use client";

import { useState } from "react";
import { Captions } from "lucide-react";
import { transcribeWithProvider } from "@/src/lib/ai-client";
import { captionsFromSegments } from "@/src/lib/video/build";
import { Button } from "@/src/components/ui/Button";
import type { TimelineClip } from "@/src/lib/video/types";
import type { MediaAsset } from "@/src/lib/media/types";
import { DownloadButton } from "@/src/components/ui/DownloadButton";
import { downloadText, safeFileName } from "@/src/lib/download";

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
  const [last, setLast] = useState<{ name: string; segments: { startSec: number; endSec: number; text: string }[] } | null>(null);

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
    const kept = clips.filter((c) => !(c.kind === "captions" && c.startSec < end && c.startSec + c.durationSec > start));
    const added = captionsFromSegments(outcome.data.segments, start, clip);
    onCaptions([...kept, ...added]);
    setLast({ name: clip.name, segments: outcome.data.segments });
    setMessage({ ok: true, text: `Added ${added.length} caption line(s) from “${clip.name}”.` });
  }

  return (
    <section aria-label="Captions from voice" className="auth-rise space-y-2 rounded-xl border border-border bg-surface p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Captions className="size-4 text-muted-text" aria-hidden="true" /> Captions from voice
      </h3>
      {voiceClips.length === 0 ? (
        <p className="text-xs text-muted-text">Add a generated voice take or an uploaded voice file to the timeline, then transcribe it into timed captions.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {voiceClips.slice(0, 6).map((c) => (
            <Button key={c.id} size="sm" variant="outline" loading={busy === c.id} disabled={busy !== null} onClick={() => void run(c)}>
              Transcribe “{c.name.slice(0, 24)}”
            </Button>
          ))}
        </div>
      )}
      {last && (
        <DownloadButton size="xs" label="Download captions (.srt)" onDownload={() => downloadText(toSrt(last.segments), safeFileName(`${last.name} captions`, "srt"), "application/x-subrip")} />
      )}
      {message && (
        <p role="status" className={`text-xs ${message.ok ? "text-success" : "text-destructive"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}

/** SubRip subtitles from timed segments. */
export function toSrt(segments: { startSec: number; endSec: number; text: string }[]): string {
  const ts = (sec: number) => {
    const ms = Math.max(0, Math.round(sec * 1000));
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
  };
  return segments.map((s, i) => `${i + 1}\n${ts(s.startSec)} --> ${ts(s.endSec)}\n${s.text}\n`).join("\n");
}
