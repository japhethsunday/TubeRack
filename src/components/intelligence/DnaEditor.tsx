"use client";

import { useState } from "react";
import { useIntel } from "@/src/components/intelligence/IntelProvider";
import { dnaFields, dnaCompleteness, emptyDNA } from "@/src/lib/intelligence/dna";
import { Textarea } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { Progress } from "@/src/components/ui/feedback";
import { LocalStorageNote } from "@/src/components/projects/ProjectsProvider";

/** Channel DNA editor: defined once per channel, consumed by every task. */
export function DnaEditor({ channelId, channelName }: { channelId: string; channelName: string }) {
  const { dnaFor, saveDNA } = useIntel();
  const current = dnaFor(channelId);
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(dnaFields().map((f) => [f.key, current[f.key] ?? ""])),
  );
  const [saved, setSaved] = useState(false);

  function save(e: React.FormEvent) {
    e.preventDefault();
    saveDNA({
      ...emptyDNA(channelId),
      ...Object.fromEntries(dnaFields().map((f) => [f.key, (draft[f.key] ?? "").trim()])),
      channelId,
      updatedAt: new Date().toISOString(),
    } as ReturnType<typeof emptyDNA>);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 3000);
  }

  const filled = dnaFields().filter((f) => (draft[f.key] ?? "").trim().length > 0).length;

  return (
    <form onSubmit={save} className="space-y-4 rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Brand DNA — {channelName}</h3>
        <span className="text-xs text-muted-text" aria-live="polite">
          {filled} of {dnaFields().length} fields · {dnaCompleteness({ ...current, ...draft } as typeof current)}%
        </span>
      </div>
      <Progress value={dnaCompleteness({ ...current, ...draft } as typeof current)} label="DNA coverage" />
      <div className="grid gap-4 sm:grid-cols-2">
        {dnaFields().map((f) => (
          <Textarea
            key={f.key}
            label={f.label}
            rows={2}
            value={draft[f.key] ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
          />
        ))}
      </div>
      <LocalStorageNote compact />
      <div className="flex items-center gap-3">
        <Button type="submit">Save DNA</Button>
        {saved && (
          <p role="status" className="text-sm text-success">
            Saved on this device.
          </p>
        )}
      </div>
    </form>
  );
}
