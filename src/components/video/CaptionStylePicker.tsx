"use client";

import { useEffect, useRef } from "react";
import { Captions } from "lucide-react";
import { cx } from "@/src/components/ui/cx";
import { CAPTION_STYLES, captionStyleFor, drawStyledCaption, type CaptionStyleId } from "@/src/lib/video/caption-styles";

/** Small animated sample of one caption style. */
function Sample({ id }: { id: CaptionStyleId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      const t = ((now - start) / 1000) % 2.4;
      ctx.clearRect(0, 0, c.width, c.height);
      const g = ctx.createLinearGradient(0, 0, c.width, c.height);
      g.addColorStop(0, "#334155");
      g.addColorStop(1, "#0f172a");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, c.width, c.height);
      drawStyledCaption(ctx, "Stop scrolling right now", id, { local: t, dur: 2.2, W: c.width, H: c.height * 1.25, unit: c.width / 480 });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [id]);
  return <canvas ref={ref} width={320} height={120} className="h-auto w-full rounded-md" aria-hidden="true" />;
}

/** Choose the caption look for this video. */
export function CaptionStylePicker({ projectId, value, onChange }: { projectId: string; value?: string; onChange: (id: CaptionStyleId | undefined) => void }) {
  const current = captionStyleFor(projectId, value);
  return (
    <section aria-label="Caption style" className="space-y-2 rounded-xl border border-border bg-surface p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Captions className="size-4 text-muted-text" aria-hidden="true" /> Caption style
      </h3>
      <p className="text-xs text-muted-text">
        {value ? "Chosen for this video." : "Picked automatically for this video, so your videos don't all look the same."} Applies to every caption line; the preview and export match.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {CAPTION_STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={current === s.id}
            onClick={() => onChange(s.id)}
            title={s.blurb}
            className={cx("rounded-lg border p-1.5 text-left transition-colors", current === s.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted")}
          >
            <Sample id={s.id} />
            <span className="mt-1 block text-xs font-medium">{s.label}</span>
          </button>
        ))}
      </div>
      {value && (
        <button type="button" onClick={() => onChange(undefined)} className="text-xs text-primary hover:underline">
          Back to automatic
        </button>
      )}
    </section>
  );
}
