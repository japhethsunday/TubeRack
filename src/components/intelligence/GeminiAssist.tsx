"use client";

import { Markdown } from "@/src/components/ui/Markdown";
import { useState } from "react";
import { Sparkles, Copy, Check } from "lucide-react";
import { runProviderIntelligence } from "@/src/lib/ai-client";
import { useIntel } from "@/src/components/intelligence/IntelProvider";
import type { IntelligenceTaskType } from "@/src/lib/intelligence/tasks";
import { Button } from "@/src/components/ui/Button";
import { DownloadButton } from "@/src/components/ui/DownloadButton";
import { downloadText, safeFileName } from "@/src/lib/download";

/**
 * One-click generation for a studio: sends the live project context, shows
 * the result, and saves it to the project so it's still there after a
 * reload or on another device. Copy and download included.
 */
export function GeminiAssist({
  task,
  title,
  blurb,
  context,
  actionLabel = "Generate",
  disabledReason,
  saveAs,
}: {
  task: IntelligenceTaskType;
  title: string;
  blurb: string;
  context: Record<string, unknown>;
  actionLabel?: string;
  disabledReason?: string;
  /** Where the result is kept: a project id (or "_workspace") plus a key unique to this tool. */
  saveAs: { projectId: string; key: string };
}) {
  const intel = useIntel();
  const saved = intel.outputFor(saveAs.projectId, saveAs.key);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState("");
  const text = fresh || saved?.text || "";
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function run() {
    setBusy(true);
    setError("");
    const outcome = await runProviderIntelligence(task, context);
    setBusy(false);
    if (outcome.ok) {
      setFresh(outcome.data.text);
      intel.saveOutputFor(saveAs.projectId, saveAs.key, outcome.data.text, title);
    } else setError(outcome.message);
  }

  return (
    <section className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="size-4 text-primary" aria-hidden="true" /> {title}
          </h3>
          <p className="mt-0.5 text-xs text-muted-text">{disabledReason || blurb}</p>
        </div>
        <Button size="sm" loading={busy} disabled={Boolean(disabledReason)} onClick={() => void run()}>
          <Sparkles className="size-3.5" aria-hidden="true" /> {text ? "Regenerate" : actionLabel}
        </Button>
      </div>
      {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {text && (
        <div className="ui-panel space-y-2">
          {!fresh && saved && <p className="text-[11px] text-muted-text">Saved {new Date(saved.at).toLocaleString()}</p>}
          <div className="max-h-[32rem] overflow-auto rounded-lg border border-border bg-surface p-4">
            <Markdown text={text} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard?.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />} {copied ? "Copied" : "Copy"}
            </Button>
            <DownloadButton onDownload={() => downloadText(text, safeFileName(title, "md"), "text/markdown")} />
            
          </div>
        </div>
      )}
    </section>
  );
}
