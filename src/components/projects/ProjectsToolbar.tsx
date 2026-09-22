"use client";

import { LayoutGrid, List, Search as SearchIcon, Download, Upload } from "lucide-react";
import type { ProjectFilter, ProjectSort } from "@/src/lib/projects/types";
import { Search } from "@/src/components/ui/search";
import { Dropdown } from "@/src/components/ui/Dropdown";
import { cx } from "@/src/components/ui/cx";

/** Index toolbar: search, channel + status filters, sort, view toggle, import/export. */
export function ProjectsToolbar({
  query,
  onQuery,
  filter,
  onFilter,
  sort,
  onSort,
  channelId,
  onChannel,
  channels,
  view,
  onView,
  onExport,
  onImport,
}: {
  query: string;
  onQuery: (v: string) => void;
  filter: ProjectFilter;
  onFilter: (v: ProjectFilter) => void;
  sort: ProjectSort;
  onSort: (v: ProjectSort) => void;
  channelId: string;
  onChannel: (v: string) => void;
  channels: { id: string; name: string }[];
  view: "grid" | "list";
  onView: (v: "grid" | "list") => void;
  onExport: () => void;
  onImport: (file: File) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 sm:max-w-sm">
          <Search value={query} onChange={onQuery} placeholder="Search name, topic, goal…" label="Search projects" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Dropdown
            label="Channel"
            value={channelId}
            onChange={onChannel}
            options={[
              { id: "all", label: "All channels" },
              ...channels.map((c) => ({ id: c.id, label: c.name })),
            ]}
          />
          <Dropdown
            label="Status"
            value={filter}
            onChange={(v) => onFilter(v as ProjectFilter)}
            options={[
              { id: "all", label: "Active + drafts" },
              { id: "active", label: "Active" },
              { id: "draft", label: "Drafts" },
              { id: "archived", label: "Archived" },
            ]}
          />
          <Dropdown
            label="Sort"
            value={sort}
            onChange={(v) => onSort(v as ProjectSort)}
            options={[
              { id: "recent", label: "Recently updated" },
              { id: "name", label: "Name A–Z" },
              { id: "progress", label: "Most complete" },
            ]}
          />
          <div role="group" aria-label="View" className="flex rounded-lg border border-border">
            <button
              type="button"
              aria-pressed={view === "grid"}
              aria-label="Grid view"
              onClick={() => onView("grid")}
              className={cx("p-2.5", view === "grid" ? "bg-muted" : "text-muted-text hover:text-foreground")}
            >
              <LayoutGrid className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-pressed={view === "list"}
              aria-label="List view"
              onClick={() => onView("list")}
              className={cx("p-2.5", view === "list" ? "bg-muted" : "text-muted-text hover:text-foreground")}
            >
              <List className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onExport}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
        >
          <Download className="size-4" aria-hidden="true" />
          Export JSON
        </button>
        <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted">
          <Upload className="size-4" aria-hidden="true" />
          Import JSON
          <input
            type="file"
            accept="application/json"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = "";
            }}
          />
        </label>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-text">
          <SearchIcon className="size-3.5" aria-hidden="true" />
          Searches names, topics, descriptions, and goals on this device.
        </span>
      </div>
    </div>
  );
}
