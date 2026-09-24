"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { useProjects, LocalStorageNote } from "@/src/components/projects/ProjectsProvider";
import { ActivityFeed } from "@/src/components/projects/ActivityFeed";
import { EmptyState } from "@/src/components/ui/states";
import { Dropdown } from "@/src/components/ui/Dropdown";
import { LoadingState } from "@/src/components/ui/feedback";
import type { ActivityEvent } from "@/src/lib/projects/types";

/** Activity center: real device-local events, filterable by category. */
export default function ActivityPage() {
  const { ready, events } = useProjects();
  const [category, setCategory] = useState<"all" | ActivityEvent["category"]>("all");

  if (!ready) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <LoadingState label="Loading activity" />
      </div>
    );
  }

  const shown = category === "all" ? events : events.filter((e) => e.category === category);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            <History className="size-6 text-muted-text" aria-hidden="true" />
            Activity
          </h1>
          <p className="mt-1 text-sm text-muted-text">
            {events.length === 0
              ? "Every creation, edit, and stage completion will log here."
              : `${events.length} event(s) recorded on this device.`}{" "}
            Updates appear as you work.
          </p>
        </div>
        <Dropdown
          label="Category"
          value={category}
          onChange={(v) => setCategory(v as typeof category)}
          options={[
            { id: "all", label: "All categories" },
            { id: "projects", label: "Projects" },
            { id: "editing", label: "Editing" },
            { id: "system", label: "System" },
          ]}
        />
      </div>
      <LocalStorageNote compact />
      {events.length === 0 ? (
        <EmptyState
          title="No activity yet"
          body="Activity is recorded only when you act — creations, renames, duplicates, archives, and stage completions. Nothing is generated."
        />
      ) : shown.length === 0 ? (
        <EmptyState
          title="Nothing in this category"
          body="Try a different category filter."
        />
      ) : (
        <div className="rounded-xl border border-border bg-surface px-5">
          <ActivityFeed events={shown} />
        </div>
      )}
    </div>
  );
}
