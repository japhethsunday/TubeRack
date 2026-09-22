"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { useAnalytics, type EntryInput } from "@/src/components/analytics/AnalyticsProvider";
import { Input, Select, Textarea } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";
import { EmptyState } from "@/src/components/ui/states";
import { Modal } from "@/src/components/ui/overlays";
import { formatCompact } from "@/src/lib/analytics/metrics";
import { timeAgo } from "@/src/components/projects/time";
import type { PerformanceEntry } from "@/src/lib/analytics/types";
import type { PlatformId } from "@/src/lib/analytics/types";

export const RANGES = [7, 28, 90, 365] as const;

export function RangePicker({ range, onChange }: { range: number; onChange: (d: number) => void }) {
  return (
    <div role="group" aria-label="Date range" className="flex rounded-lg border border-border p-0.5">
      {RANGES.map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={range === d}
          onClick={() => onChange(d)}
          className={`h-8 rounded-md px-2.5 text-xs font-medium ${range === d ? "bg-muted text-foreground" : "text-muted-text hover:text-foreground"}`}
        >
          {d}D
        </button>
      ))}
    </div>
  );
}

const NUM_FIELDS: { key: keyof EntryInput; label: string; hint?: string }[] = [
  { key: "views", label: "Views" },
  { key: "watchHours", label: "Watch hours" },
  { key: "likes", label: "Likes" },
  { key: "comments", label: "Comments" },
  { key: "shares", label: "Shares" },
  { key: "subsGained", label: "Subscribers gained" },
  { key: "impressions", label: "Impressions" },
  { key: "ctr", label: "CTR %" },
  { key: "avgViewDurationSec", label: "Avg view duration (s)" },
  { key: "retentionPct", label: "Avg retention %" },
];

/** Manual performance log: validated numbers, provenance always manual. */
export function EntryForm({
  projectId,
  projectName,
  onDone,
}: {
  projectId: string;
  projectName: string;
  onDone?: () => void;
}) {
  const { logEntry } = useAnalytics();
  const today = new Date().toISOString().slice(0, 10);
  const [platform, setPlatform] = useState<PlatformId>("youtube");
  const [date, setDate] = useState(today);
  const [nums, setNums] = useState<Record<string, string>>({ views: "" });
  const [trafficSource, setTrafficSource] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const views = Number(nums.views);
    if (!Number.isInteger(views) || views < 0) {
      setError("Views is required — a whole number, zero or more.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError("Use a real date (YYYY-MM-DD).");
      return;
    }
    const parsed: Record<string, number> = {};
    for (const [k, v] of Object.entries(nums)) {
      if (v.trim() === "") continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) {
        setError(`“${k}” must be zero or more — no negatives, no text.`);
        return;
      }
      parsed[k] = n;
    }
    if (parsed.ctr !== undefined && parsed.ctr > 100) {
      setError("CTR cannot exceed 100%.");
      return;
    }
    if (parsed.retentionPct !== undefined && parsed.retentionPct > 100) {
      setError("Retention cannot exceed 100%.");
      return;
    }
    setError(null);
    logEntry({
      projectId,
      platform,
      date,
      views,
      ...parsed,
      trafficSource: trafficSource.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setNums({ views: "" });
    setNotes("");
    onDone?.();
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-xl border border-border bg-surface p-4" aria-label={`Log performance for ${projectName}`}>
      <div className="grid gap-2 sm:grid-cols-2">
        <Select label="Platform" value={platform} onChange={(e) => setPlatform(e.target.value as PlatformId)}>
          {(["youtube", "shorts", "tiktok", "reels", "x", "linkedin", "facebook"] as const).map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </Select>
        <Input label="Observed date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {NUM_FIELDS.map((f) => (
          <Input
            key={f.key}
            label={f.label}
            inputMode="decimal"
            value={nums[f.key] ?? ""}
            onChange={(e) => setNums((n) => ({ ...n, [f.key]: e.target.value }))}
            placeholder="—"
          />
        ))}
      </div>
      <Input label="Traffic source (optional)" value={trafficSource} onChange={(e) => setTrafficSource(e.target.value)} placeholder="e.g. Browse, Search" />
      <Textarea label="Notes (optional)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What do you want future-you to know?" />
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <Button type="submit" size="sm">Log entry (self-reported)</Button>
    </form>
  );
}

/** Content table: search, filters, sort, project links. Mobile-first rows. */
export function ContentTable({
  rows,
  query,
  onQuery,
  platform,
  onPlatform,
  sort,
  onSort,
}: {
  rows: { projectId: string; projectName: string; platform: string; topic: string; format: string; views: number; entries: number; latest?: string }[];
  query: string;
  onQuery: (v: string) => void;
  platform: string;
  onPlatform: (v: string) => void;
  sort: "views" | "recent";
  onSort: (v: "views" | "recent") => void;
}) {
  const q = query.trim().toLowerCase();
  const shown = rows
    .filter((r) => (platform === "all" ? true : r.platform === platform))
    .filter((r) => !q || `${r.projectName} ${r.topic} ${r.format}`.toLowerCase().includes(q))
    .sort((a, b) => (sort === "views" ? b.views - a.views : (b.latest ?? "").localeCompare(a.latest ?? "")));

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <Input label="Search content" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Title, topic, format…" />
        </div>
        <div className="flex gap-2">
          <Select label="Platform" value={platform} onChange={(e) => onPlatform(e.target.value)}>
            {["all", "youtube", "shorts", "tiktok", "reels", "x", "linkedin", "facebook"].map((p) => (
              <option key={p} value={p}>{p === "all" ? "All platforms" : p}</option>
            ))}
          </Select>
          <Select label="Sort" value={sort} onChange={(e) => onSort(e.target.value as typeof sort)}>
            <option value="views">Most views</option>
            <option value="recent">Most recent</option>
          </Select>
        </div>
      </div>
      {shown.length === 0 ? (
        <EmptyState title="No matching content" body="Log performance for a project, or adjust search and filters." />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border" aria-label="Content performance">
          {shown.map((r) => (
            <li key={`${r.projectId}-${r.platform}`} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <Link href={`/analytics?tab=content&project=${r.projectId}`} className="block truncate text-sm font-medium hover:underline">
                  {r.projectName}
                </Link>
                <p className="truncate text-xs text-muted-text">
                  {r.platform} · {r.format} · {r.topic.slice(0, 60)} · {r.entries} log(s){r.latest ? ` · latest ${r.latest}` : ""}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums" aria-label={`${r.views} views`}>
                {formatCompact(r.views)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Per-video detail: totals, entries table with edit/delete, retention notes. */
export function VideoDetail({
  projectId,
  projectName,
  entries,
  onEditEntry,
}: {
  projectId: string;
  projectName: string;
  entries: PerformanceEntry[];
  onEditEntry: (entry: PerformanceEntry) => void;
}) {
  const { removeEntry } = useAnalytics();
  const [confirm, setConfirm] = useState<string | null>(null);
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {projectName} — {entries.length} log(s)
        </h3>
        <Link href={`/projects/${projectId}`} className="text-xs font-medium underline">
          Open project
        </Link>
      </div>
      {sorted.length === 0 ? (
        <EmptyState title="No logs for this video" body="Log the numbers you see on the platform dashboard. Each entry is timestamped and self-reported." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Logged performance for {projectName}</caption>
            <thead>
              <tr className="border-b border-border bg-muted/60">
                {["Date", "Platform", "Views", "Watch h", "Eng.", "Subs", "CTR", ""].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 text-xs font-medium text-muted-text">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 tabular-nums">{e.date}</td>
                  <td className="px-3 py-2">{e.platform}</td>
                  <td className="px-3 py-2 font-medium tabular-nums">{e.views.toLocaleString()}</td>
                  <td className="px-3 py-2 tabular-nums">{e.watchHours ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{(e.likes ?? 0) + (e.comments ?? 0) + (e.shares ?? 0)}</td>
                  <td className="px-3 py-2 tabular-nums">{e.subsGained ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{e.ctr != null ? `${e.ctr}%` : "—"}</td>
                  <td className="px-3 py-2">
                    <span className="flex gap-1">
                      <button type="button" onClick={() => onEditEntry(e)} className="text-xs underline">Edit</button>
                      {confirm === e.id ? (
                        <span className="inline-flex items-center gap-1 text-xs">
                          <button type="button" onClick={() => { removeEntry(e.id); setConfirm(null); }} className="font-medium text-destructive underline">Delete</button>
                          <button type="button" onClick={() => setConfirm(null)} className="text-muted-text underline">Keep</button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => setConfirm(e.id)} className="text-xs text-muted-text underline">Delete</button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Retention notes: timestamped observations linked to sections. */
export function RetentionPanel({
  projectId,
  sections,
}: {
  projectId: string;
  sections: { id: string; heading: string }[];
}) {
  const { retentionFor, addRetentionNote, removeRetentionNote } = useAnalytics();
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [atSec, setAtSec] = useState("");
  const [sectionId, setSectionId] = useState("");
  const notes = retentionFor(projectId);

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!note.trim() || !label.trim()) return;
          const at = atSec.trim() === "" ? undefined : Number(atSec);
          addRetentionNote({
            projectId,
            label: label.trim(),
            note: note.trim(),
            atSec: at !== undefined && Number.isFinite(at) && at >= 0 ? at : undefined,
            sectionId: sectionId || undefined,
          });
          setLabel("");
          setNote("");
          setAtSec("");
        }}
        className="grid gap-2 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2"
        aria-label="Log retention observation"
      >
        <Input label="Observation" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Intro dip" />
        <Input label="Timestamp (s, optional)" inputMode="decimal" value={atSec} onChange={(e) => setAtSec(e.target.value)} placeholder="45" />
        <div className="sm:col-span-2">
          <Textarea label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you see, and where in the video?" />
        </div>
        <Select label="Linked section (optional)" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
          <option value="">None</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>{s.heading}</option>
          ))}
        </Select>
        <div className="flex items-end">
          <Button type="submit" size="sm">Save observation</Button>
        </div>
      </form>
      {notes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-text">
          No observations yet. Timestamped notes (“dip at 0:45, payoff too late”) become retention signals — written in your words, never auto-generated curves.
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Retention observations">
          {notes.map((n) => (
            <li key={n.id} className="rounded-xl border border-border bg-surface p-3 text-sm">
              <p className="flex items-center justify-between gap-2 font-medium">
                {n.label}
                <span className="flex items-center gap-2 text-xs font-normal text-muted-text">
                  {n.atSec != null && <Badge tone="neutral">{n.atSec}s</Badge>}
                  <span title={n.createdAt}>{timeAgo(n.createdAt)}</span>
                  <button type="button" onClick={() => removeRetentionNote(n.id)} className="underline">Delete</button>
                </span>
              </p>
              <p className="mt-0.5 text-muted-text">{n.note}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EntryEditModal({ entry, onClose }: { entry: PerformanceEntry; onClose: () => void }) {
  const { updateEntry } = useAnalytics();
  const [views, setViews] = useState(String(entry.views));
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="Edit log entry" description={`${entry.date} · ${entry.platform} — corrections keep history honest.`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const v = Number(views);
          if (!Number.isInteger(v) || v < 0) {
            setError("Views must be a whole number, zero or more.");
            return;
          }
          updateEntry(entry.id, { views: v, notes: notes.trim() || undefined });
          onClose();
        }}
        className="space-y-3"
      >
        <Input label="Views" inputMode="numeric" value={views} onChange={(e) => setViews(e.target.value)} />
        <Textarea label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save correction</Button>
        </div>
      </form>
    </Modal>
  );
}
