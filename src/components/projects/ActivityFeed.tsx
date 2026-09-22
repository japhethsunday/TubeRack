import Link from "next/link";
import { timeAgo, formatDateTime } from "@/src/components/projects/time";
import type { ActivityEvent } from "@/src/lib/projects/types";
import { Badge } from "@/src/components/ui/Badge";

const KIND_LABELS: Record<ActivityEvent["kind"], string> = {
  "project.created": "Project created",
  "project.renamed": "Project renamed",
  "project.duplicated": "Project duplicated",
  "project.archived": "Project archived",
  "project.restored": "Project restored",
  "project.deleted": "Project deleted",
  "project.stage": "Stage completed",
  "channel.created": "Channel created",
};

/** Real activity feed from device-local events. Links back where the target exists. */
export function ActivityFeed({ events, limit }: { events: ActivityEvent[]; limit?: number }) {
  const shown = limit ? events.slice(0, limit) : events;
  return (
    <ol className="divide-y divide-border" aria-label="Activity">
      {shown.map((e) => (
        <li key={e.id} className="flex items-start justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="text-sm">
              <span className="font-medium">{KIND_LABELS[e.kind]}</span>
              {" — "}
              {e.projectId && e.kind !== "project.deleted" ? (
                <Link href={`/projects/${e.projectId}`} className="hover:underline">
                  {e.projectName}
                </Link>
              ) : (
                <span>{e.projectName}</span>
              )}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-text" title={e.detail}>
              {e.detail}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-2">
            <Badge tone="neutral">{e.category}</Badge>
            <time dateTime={e.at} title={formatDateTime(e.at)} className="text-xs text-muted-text">
              {timeAgo(e.at)}
            </time>
          </span>
        </li>
      ))}
    </ol>
  );
}
