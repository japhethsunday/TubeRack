"use client";

import { Check, X } from "lucide-react";
import type { IntelItem, IntelItemStatus } from "@/src/lib/intelligence/shelf";
import { EditableText } from "@/src/components/intelligence/output";
import { Badge } from "@/src/components/ui/Badge";
import { EmptyState } from "@/src/components/ui/states";

/** Saved titles/hooks with edit-in-place and approve/reject review. */
export function SavedItems({
  kind,
  items,
  onEdit,
  onStatus,
  emptyHint,
}: {
  kind: "title" | "hook";
  items: IntelItem[];
  onEdit: (id: string, text: string) => void;
  onStatus: (id: string, status: IntelItemStatus) => void;
  emptyHint: string;
}) {
  if (items.length === 0) {
    return <EmptyState title={`No saved ${kind}s`} body={emptyHint} />;
  }
  return (
    <ul className="space-y-2" aria-label={`Saved ${kind}s`}>
      {items.map((item) => (
        <li key={item.id} className="rounded-lg border border-border bg-surface p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <EditableText
                label={`${kind} text`}
                value={item.text}
                onSave={(next) => {
                  if (next.trim() && next !== item.text) onEdit(item.id, next);
                }}
              />
              {item.note && <p className="mt-1 text-xs text-muted-text">{item.note}</p>}
            </div>
            <Badge tone={item.status === "approved" ? "ok" : item.status === "rejected" ? "neutral" : "info"}>
              {item.status}
            </Badge>
          </div>
          {item.status === "draft" && (
            <div className="mt-2 flex gap-2" role="group" aria-label={`Review ${kind}`}>
              <button
                type="button"
                onClick={() => onStatus(item.id, "approved")}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-muted"
              >
                <Check className="size-3.5" aria-hidden="true" />
                Approve
              </button>
              <button
                type="button"
                onClick={() => onStatus(item.id, "rejected")}
                className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-muted-text hover:bg-muted"
              >
                <X className="size-3.5" aria-hidden="true" />
                Reject
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
