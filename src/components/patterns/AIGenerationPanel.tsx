"use client";

import { useState } from "react";
import { Sparkles, RotateCcw, Check, Pencil, X, Ban } from "lucide-react";
import { Button } from "@/src/components/ui/Button";
import { Textarea } from "@/src/components/ui/fields";
import { Progress } from "@/src/components/ui/feedback";
import { Badge } from "@/src/components/ui/Badge";
import { Alert } from "@/src/components/ui/Alert";
import { cx } from "@/src/components/ui/cx";

type PanelState = "idle" | "running" | "review";

/**
 * AI generation panel pattern: prompt → settings → generate → progress →
 * result → accept / edit / regenerate. No provider is connected in Phase 2;
 * "Run pattern preview" animates the interaction states only, honestly labeled.
 */
export function AIGenerationPanel({
  title,
  capability,
  boundaryNote,
}: {
  title: string;
  capability: string;
  boundaryNote: string;
}) {
  const [state, setState] = useState<PanelState>("idle");
  const [progress, setProgress] = useState(0);
  const [decided, setDecided] = useState<string | null>(null);

  function runPreview() {
    setDecided(null);
    setState("running");
    setProgress(0);
    const t = window.setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          window.clearInterval(t);
          setState("review");
          return 100;
        }
        return p + 20;
      });
    }, 220);
  }

  function cancel() {
    setState("idle");
    setProgress(0);
  }

  return (
    <section
      aria-label={title}
      className="rounded-xl border border-border bg-surface p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-muted-text" aria-hidden="true" />
          {title}
        </h3>
        <div className="flex gap-1.5">
          <Badge tone="preview">Pattern preview</Badge>
          <Badge tone="neutral">{capability}</Badge>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <Textarea
          label="Prompt / context"
          placeholder="Describe the angle, audience, and key points…"
          hint="In production this inherits the project brief automatically."
        />

        {state === "idle" && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={runPreview}>
              <Sparkles className="size-4" aria-hidden="true" />
              Run pattern preview
            </Button>
          </div>
        )}

        {state === "running" && (
          <div className="space-y-3">
            <Progress value={progress} label="Generating (simulated pattern)" />
            <Button variant="outline" size="sm" onClick={cancel}>
              <Ban className="size-4" aria-hidden="true" />
              Cancel
            </Button>
          </div>
        )}

        {state === "review" && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-text">
                Simulated result — no AI was called
              </p>
              <p className="mt-2 text-sm leading-relaxed">
                “Three hooks tested against your retention profile: open with the
                payoff, restate the stakes at 0:30, and plant one open loop
                before the first transition.”
              </p>
            </div>
            {decided ? (
              <p role="status" className="text-sm text-muted-text">
                {decided}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Review actions">
                <Button size="sm" onClick={() => setDecided("Accepted (preview — nothing saved).")}>
                  <Check className="size-4" aria-hidden="true" />
                  Accept
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDecided("Opened in editor (preview — nothing saved).")}>
                  <Pencil className="size-4" aria-hidden="true" />
                  Edit
                </Button>
                <Button size="sm" variant="outline" onClick={runPreview}>
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Regenerate
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDecided("Rejected (preview — nothing saved).")}
                  className={cx()}
                >
                  <X className="size-4" aria-hidden="true" />
                  Reject
                </Button>
              </div>
            )}
          </div>
        )}

        <Alert tone="warn" title="Not connected">
          {boundaryNote}
        </Alert>
      </div>
    </section>
  );
}
