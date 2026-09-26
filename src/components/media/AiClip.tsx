"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { api, ApiError } from "@/src/lib/api";
import { useMedia } from "@/src/components/media/MediaProvider";
import type { MediaAsset } from "@/src/lib/media/types";
import { Alert } from "@/src/components/ui/Alert";
import { cx } from "@/src/components/ui/cx";

type Aspect = "16:9" | "9:16" | "1:1";

/** Shrink an image to at most 1024px on its long side and return it as a JPEG data URL. */
async function toDataUrl(src: string): Promise<string> {
  const blob = await (await fetch(src)).blob();
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.9);
}

/**
 * Short AI video clips from a description, or by bringing one of the
 * project's images to life. Free engines with a small daily allowance.
 */
export function AiClip({
  projectId,
  aspect,
  urlFor,
  onAdded,
}: {
  projectId: string;
  aspect: Aspect;
  urlFor: (asset: MediaAsset) => string | null;
  onAdded?: (asset: MediaAsset) => void;
}) {
  const { addAsset, assetsFor } = useMedia();
  const images = assetsFor(projectId).filter((a) => a.kind === "image" && urlFor(a));
  const [prompt, setPrompt] = useState("");
  const [imageId, setImageId] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(3);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!busy) return;
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const picked = images.find((a) => a.id === imageId) ?? null;

  async function generate() {
    if (prompt.trim().length < 3) {
      setError("Describe the motion or scene you want, e.g. “slow zoom into a city skyline at night”.");
      return;
    }
    setBusy(true);
    setElapsed(0);
    setError(null);
    setDone(null);
    try {
      const image = picked ? await toDataUrl(urlFor(picked)!) : undefined;
      const data = await api.post<{ url: string; mime: string; fileSize: number }>("/api/v1/ai/video-clip", {
        prompt: prompt.trim(),
        image,
        aspect,
        seconds,
      });
      const asset = addAsset({
        projectId,
        sceneIds: [],
        kind: "video",
        source: "provider-output",
        status: "ready",
        title: prompt.trim().slice(0, 60),
        payload: data.url,
        mime: data.mime,
        durationSec: seconds,
        fileSize: data.fileSize,
        tags: ["ai-clip"],
        approval: "draft",
      });
      onAdded?.(asset);
      setDone("Clip added to your timeline at the playhead.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't make the clip. Please try again in a few minutes.");
    }
    setBusy(false);
  }

  return (
    <section aria-label="AI video clip" className="space-y-3">
      <p className="text-xs text-muted-text">
        Describe a short shot, or pick one of your images to bring it to life. Clips are {seconds}s long and take 1–4 minutes.
      </p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        maxLength={1500}
        aria-label="Describe the clip"
        placeholder="e.g. Slow drone shot over a misty forest at sunrise"
        className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-sm"
      />

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-text">Start from an image (optional)</span>
          {picked && (
            <button type="button" onClick={() => setImageId(null)} className="flex items-center gap-0.5 text-muted-text hover:text-foreground">
              <X className="size-3" aria-hidden="true" /> Clear
            </button>
          )}
        </div>
        {images.length === 0 ? (
          <p className="text-[11px] text-muted-text">Add images in Media or Stock to animate them here.</p>
        ) : (
          <ul className="grid grid-cols-4 gap-1.5">
            {images.slice(0, 12).map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  aria-pressed={imageId === a.id}
                  aria-label={`Animate ${a.title}`}
                  onClick={() => setImageId(imageId === a.id ? null : a.id)}
                  className={cx("block aspect-square w-full overflow-hidden rounded-md border-2", imageId === a.id ? "border-primary" : "border-transparent hover:border-border")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- project media. */}
                  <img src={urlFor(a)!} alt="" loading="lazy" className="size-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-[11px]">
        <span className="text-muted-text">Length:</span>
        {[2, 3, 5].map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={seconds === s}
            onClick={() => setSeconds(s)}
            className={cx("rounded-full border px-2 py-0.5", seconds === s ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-text hover:bg-muted")}
          >
            {s}s
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => void generate()}
        disabled={busy}
        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
        {busy ? `Making your clip… ${elapsed}s` : picked ? "Animate image" : "Generate clip"}
      </button>

      {error && <Alert tone="bad" title="AI clip">{error}</Alert>}
      {done && <Alert tone="ok" title="Done">{done}</Alert>}
      <p className="text-[10px] text-muted-text">Beta · free with a small daily limit (5 clips per person per day). Busy times may need a retry.</p>
    </section>
  );
}
