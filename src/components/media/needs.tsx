"use client";

import Link from "next/link";
import { useMedia, MediaStorageNote } from "@/src/components/media/MediaProvider";
import { Badge } from "@/src/components/ui/Badge";
import { Button } from "@/src/components/ui/Button";
import { EmptyState } from "@/src/components/ui/states";
import { formatDuration } from "@/src/lib/script/measure";

export interface BoardScene {
  id: string;
  number: number;
  title: string;
  scriptText: string;
  visual: string;
  durationSec: number;
  assetsNeeded: string[];
  narration: string;
}

/**
 * Scene visual planner: what each scene needs, what it has, what is missing.
 * Links jump straight into the right generator with the scene preselected.
 */
export function SceneNeeds({
  projectId,
  scenes,
  onJump,
}: {
  projectId: string;
  scenes: BoardScene[];
  onJump: (tab: string, sceneId: string) => void;
}) {
  const { assetsFor } = useMedia();
  const assets = assetsFor(projectId);

  if (scenes.length === 0) {
    return (
      <EmptyState
        title="No scenes yet"
        body="Build the board from script sections in the Storyboard — scene requirements appear here automatically."
        action={
          <Link href={`/studio/storyboard?project=${projectId}`} className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
            Open Storyboard
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {scenes.map((s) => {
        const assigned = assets.filter((a) => a.sceneIds.includes(s.id) && a.status === "ready");
        const hasStill = assigned.some((a) => a.kind === "image");
        const hasVoice = assigned.some((a) => a.kind === "voice");
        const missing: string[] = [];
        if (!hasStill) missing.push("still / visual");
        if (s.scriptText.trim().split(/\s+/).filter(Boolean).length > 20 && !hasVoice) missing.push("voiceover");
        if (s.assetsNeeded.length > 0) {
          const covered = s.assetsNeeded.filter((need) =>
            assigned.some((a) => a.title.toLowerCase().includes(need.toLowerCase().split(" ")[0]) || a.tags.some((t) => need.toLowerCase().includes(t))),
          );
          for (const need of s.assetsNeeded) {
            if (!covered.includes(need)) missing.push(need);
          }
        }
        return (
          <article key={s.id} aria-label={`Scene ${s.number}: ${s.title}`} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold">
                  {s.number}. {s.title}
                </h4>
                <p className="mt-0.5 line-clamp-2 max-w-prose text-xs text-muted-text">
                  {s.visual || s.scriptText.slice(0, 140) || "No direction yet."}
                </p>
                <p className="mt-1 text-xs text-muted-text">~{formatDuration(s.durationSec)}</p>
              </div>
              <span className="flex gap-1.5">
                {missing.length === 0 ? <Badge tone="ok">Covered</Badge> : <Badge tone="warn">{missing.length} missing</Badge>}
              </span>
            </div>
            {assigned.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Assigned assets">
                {assigned.map((a) => (
                  <li key={a.id}>
                    <Badge tone="neutral">{a.title.length > 28 ? `${a.title.slice(0, 28)}…` : a.title}</Badge>
                  </li>
                ))}
              </ul>
            )}
            {missing.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`Fill gaps in scene ${s.number}`}>
                {missing.includes("still / visual") && (
                  <Button size="sm" variant="outline" onClick={() => onJump("image", s.id)}>
                    Generate still
                  </Button>
                )}
                {missing.includes("voiceover") && (
                  <Button size="sm" variant="outline" onClick={() => onJump("voice", s.id)}>
                    Record voiceover
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => onJump("library", s.id)}>
                  Browse library
                </Button>
              </div>
            )}
          </article>
        );
      })}
      <MediaStorageNote compact />
    </div>
  );
}
