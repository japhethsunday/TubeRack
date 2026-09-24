"use client";

import { useState } from "react";
import { Download, Check } from "lucide-react";
import { cx } from "@/src/components/ui/cx";

/**
 * One download affordance for every finished generation. `onDownload`
 * does the work (text, blob, or stored file); the button confirms it.
 */
export function DownloadButton({
  onDownload,
  label = "Download",
  size = "sm",
  className,
}: {
  onDownload: () => void | Promise<void>;
  label?: string;
  size?: "xs" | "sm";
  className?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await onDownload();
        setDone(true);
        window.setTimeout(() => setDone(false), 1600);
      }}
      className={cx(
        "group inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface font-medium text-foreground hover:-translate-y-px hover:border-violet-400/50 hover:bg-muted",
        size === "xs" ? "h-7 px-2 text-xs" : "h-8 px-3 text-xs",
        className,
      )}
    >
      {done ? (
        <Check className="size-3.5 text-success" aria-hidden="true" />
      ) : (
        <Download className="size-3.5 transition-transform duration-200 group-hover:translate-y-0.5" aria-hidden="true" />
      )}
      {done ? "Saved" : label}
    </button>
  );
}
