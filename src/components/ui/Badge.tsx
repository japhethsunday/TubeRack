import type { ReactNode } from "react";
import { cx } from "@/src/components/ui/cx";

type Tone = "neutral" | "ok" | "warn" | "bad" | "info" | "preview";

const tones: Record<Tone, string> = {
  neutral: "border-border bg-muted text-foreground",
  ok: "border-success/30 bg-success/10 text-success",
  warn: "border-warning/30 bg-warning/10 text-warning",
  bad: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-info/30 bg-info/10 text-info",
  preview: "border-dashed border-muted-text/50 bg-transparent text-muted-text",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
