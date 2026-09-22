"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { FolderKanban, Dna, Coins } from "lucide-react";
import { useProjects } from "@/src/components/projects/ProjectsProvider";
import { useIntel } from "@/src/components/intelligence/IntelProvider";
import { dnaCompleteness } from "@/src/lib/intelligence/dna";
import { Dropdown } from "@/src/components/ui/Dropdown";
import { Badge } from "@/src/components/ui/Badge";
import { Progress } from "@/src/components/ui/feedback";
import type { UsageKind } from "@/src/types/domain";

/** Project attach selector: intelligence runs attach to Workspace → Channel → Project. */
export function ProjectAttach({
  projectId,
  onChange,
}: {
  projectId: string | null;
  onChange: (id: string | null) => void;
}) {
  const { projects, channelName } = useProjects();
  const { countsFor } = useIntel();
  const active = projects.filter((p) => p.status !== "archived");

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-4">
      <FolderKanban className="size-4 shrink-0 text-muted-text" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">Attached project</p>
        <p className="truncate text-xs text-muted-text">
          {projectId
            ? `${projects.find((p) => p.id === projectId)?.name ?? "Unknown"} · saves land in project intelligence`
            : "Standalone run — attach a project to save results into its intelligence."}
        </p>
      </div>
      <Dropdown
        label={projectId ? "Change project" : "Attach project"}
        value={projectId ?? undefined}
        onChange={(v) => onChange(v === "__none" ? null : v)}
        options={[
          { id: "__none", label: "Standalone (no save)" },
          ...active.map((p) => ({
            id: p.id,
            label: p.name,
            hint: channelName(p.channelId),
          })),
        ]}
      />
      {projectId && (
        <span className="flex gap-1.5" aria-label="Saved intelligence counts">
          {(() => {
            const c = countsFor(projectId);
            return (
              <>
                {c.hasAudience && <Badge tone="ok">Audience</Badge>}
                {c.hasStrategy && <Badge tone="ok">Strategy</Badge>}
                {c.titles > 0 && <Badge tone="neutral">{c.titles} titles</Badge>}
                {c.hooks > 0 && <Badge tone="neutral">{c.hooks} hooks</Badge>}
              </>
            );
          })()}
        </span>
      )}
    </div>
  );
}

/** DNA coverage strip for the active channel context. */
export function DnaStrip({ channelId, channelName }: { channelId: string; channelName: string }) {
  const { dnaFor } = useIntel();
  const dna = dnaFor(channelId);
  const completeness = dnaCompleteness(dna);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4">
      <Dna className="size-4 shrink-0 text-muted-text" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">
          Channel DNA — {channelName} · {completeness}% defined
        </p>
        <div className="mt-1.5 max-w-xs">
          <Progress value={completeness} label="DNA coverage" />
        </div>
      </div>
      <a
        href="/intelligence?tab=dna"
        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
      >
        Edit DNA
      </a>
    </div>
  );
}

/** Usage honesty tag: task type declared for Phase 11 metering, no numbers invented. */
export function UsageNote({ kind, taskLabel }: { kind: UsageKind; taskLabel: string }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-text">
      <Coins className="size-3.5" aria-hidden="true" />
      Usage: {taskLabel} · {kind} · metered with real providers in Phase 11.
      <Badge tone="preview">Unmetered preview</Badge>
    </p>
  );
}

/** Deep-link params for intelligence pages (?project=, ?idea=). Call inside Suspense. */
export function useIntelQuery(): { projectId: string | null; idea: string | null } {
  const params = useSearchParams();
  return { projectId: params.get("project"), idea: params.get("idea") };
}

/** Channel picker shared by DNA + gaps contexts. */
export function useChannelPicker() {
  const { channels, channelName } = useProjects();
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const effectiveId = channelId || channels[0]?.id || "preview-channel";
  return {
    channelId: effectiveId,
    channelName: channels.length > 0 ? channelName(effectiveId) : "Preview channel",
    picker: (
      <Dropdown
        label="Channel context"
        value={effectiveId}
        onChange={setChannelId}
        options={
          channels.length > 0
            ? channels.map((c) => ({ id: c.id, label: c.name }))
            : [{ id: "preview-channel", label: "Preview channel" }]
        }
      />
    ),
  };
}
