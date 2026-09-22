"use client";

import { useState } from "react";
import { PLATFORMS, platformById } from "@/src/lib/package/platforms";
import type { PlatformId } from "@/src/lib/package/types";
import { usePackaging } from "@/src/components/package/PackagingProvider";
import { ApprovalFlow } from "@/src/components/package/approval";
import { Textarea, Input } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";
import { LocalStorageNote } from "@/src/components/projects/ProjectsProvider";

/** Platform packaging: per-platform fields, limits, and honest validation. */
export function PlatformsPanel({
  projectId,
  defaults,
}: {
  projectId: string;
  defaults: { title: string; description: string; hashtags: string[] };
}) {
  const { packFor, savePack } = usePackaging();
  const [platform, setPlatform] = useState<PlatformId>("youtube");
  const def = platformById(platform);
  const saved = packFor(projectId, platform);
  const [fields, setFields] = useState<Record<string, string>>(saved.fields);

  function select(p: PlatformId) {
    const current = packFor(projectId, p);
    setPlatform(p);
    setFields(prefill(p, current.fields));
  }

  function prefill(p: PlatformId, existing: Record<string, string>): Record<string, string> {
    if (Object.keys(existing).length > 0) return existing;
    const d = platformById(p);
    const out: Record<string, string> = {};
    if (d.fields.some((f) => f.key === "title")) out.title = defaults.title;
    if (d.fields.some((f) => f.key === "description")) out.description = defaults.description;
    if (d.fields.some((f) => f.key === "hashtags")) out.hashtags = defaults.hashtags.join(" ");
    return out;
  }

  const overLimit = def.fields.filter((f) => f.maxLength && (fields[f.key] ?? "").length > f.maxLength);

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <ul className="flex gap-1 overflow-x-auto lg:flex-col" role="tablist" aria-label="Platforms">
        {PLATFORMS.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              role="tab"
              aria-selected={platform === p.id}
              onClick={() => select(p.id)}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${platform === p.id ? "border-primary bg-primary/5 font-medium" : "border-border hover:bg-muted/50"}`}
            >
              {p.label}
              <span className="block text-[11px] font-normal text-muted-text">{p.aspect}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">{def.label}</h3>
            <p className="text-xs text-muted-text">{def.blurb} Target: {def.captionTarget}</p>
          </div>
          <Badge tone="neutral">Up to {def.hashtagLimit} hashtags</Badge>
        </div>

        {def.fields.map((f) =>
          f.key === "description" || f.key === "caption" || f.key === "post" || f.key === "thread" ? (
            <Textarea
              key={f.key}
              label={`${f.label}${f.required ? " (required)" : ""}`}
              rows={f.key === "thread" ? 5 : 3}
              value={fields[f.key] ?? ""}
              hint={`${f.hint}${f.maxLength ? ` ${(fields[f.key] ?? "").length}/${f.maxLength}.` : ""}`}
              onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
            />
          ) : (
            <Input
              key={f.key}
              label={`${f.label}${f.required ? " (required)" : ""}`}
              value={fields[f.key] ?? ""}
              hint={`${f.hint}${f.maxLength ? ` ${(fields[f.key] ?? "").length}/${f.maxLength}.` : ""}`}
              onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
            />
          ),
        )}

        {overLimit.length > 0 && (
          <p role="alert" className="rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
            Over limit: {overLimit.map((f) => f.label).join(", ")} — trim before approving.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => savePack(projectId, { platform, fields, approval: saved.approval, updatedAt: new Date().toISOString() })}
          >
            Save {def.label} pack
          </Button>
          <ApprovalFlow
            status={saved.approval}
            compact
            onChange={(next) => savePack(projectId, { platform, fields, approval: next, updatedAt: new Date().toISOString() })}
          />
        </div>
        <p className="text-xs text-muted-text">
          Nothing uploads anywhere — packs assemble the exact payloads publishing will send in a later phase.
        </p>
        <LocalStorageNote compact />
      </div>
    </div>
  );
}
