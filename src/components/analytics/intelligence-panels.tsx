"use client";

import { useState } from "react";
import { Sparkles, Archive, Trash2, Download, Camera } from "lucide-react";
import { useAnalytics } from "@/src/components/analytics/AnalyticsProvider";
import type { CreatorInsight, SignalKind } from "@/src/lib/analytics/types";
import { sampleGate } from "@/src/lib/analytics/metrics";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";
import { Input, Textarea } from "@/src/components/ui/fields";
import { EmptyState } from "@/src/components/ui/states";
import { MethodologyNote } from "@/src/components/intelligence/output";
import { LocalStorageNote } from "@/src/components/projects/ProjectsProvider";

/** Insight card: Observation / Evidence / Implication + save + opportunity. */
export function InsightCard({
  insight,
  onSave,
  onOpportunity,
  saved,
}: {
  insight: CreatorInsight & { gated: boolean };
  onSave: () => void;
  onOpportunity: () => void;
  saved: boolean;
}) {
  return (
    <article aria-label="AI insight" className="rounded-xl border border-border bg-surface p-4">
      {insight.gated && <Badge tone="warn">Numbers only — sample too small for conclusions</Badge>}
      <dl className="mt-2 space-y-1.5 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-text">Observation</dt>
          <dd className="mt-0.5">{insight.observation}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-text">Evidence</dt>
          <dd className="mt-0.5 text-muted-text">{insight.evidence}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-text">Potential implication</dt>
          <dd className="mt-0.5 text-muted-text">{insight.implication}</dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        {!saved ? (
          <Button size="sm" variant="outline" onClick={onSave}>
            Save to Channel Intelligence
          </Button>
        ) : (
          <Badge tone="ok">Saved as signal</Badge>
        )}
        <Button size="sm" variant="ghost" onClick={onOpportunity}>
          <Sparkles className="size-3.5" aria-hidden="true" />
          New opportunity
        </Button>
      </div>
    </article>
  );
}

const SIGNAL_KINDS: { id: SignalKind; label: string }[] = [
  { id: "topic-strength", label: "Topic strength" },
  { id: "topic-weak", label: "Topic weakness" },
  { id: "format", label: "Format pattern" },
  { id: "hook", label: "Hook pattern" },
  { id: "retention", label: "Retention pattern" },
  { id: "packaging", label: "Packaging pattern" },
  { id: "gap", label: "Content gap" },
  { id: "pattern", label: "General pattern" },
];

/** Channel Intelligence: signals list + manual capture + archive. */
export function SignalsPanel({ compact }: { compact?: boolean }) {
  const { activeSignals, signals, saveSignal, archiveSignal, removeSignal } = useAnalytics();
  const [title, setTitle] = useState("");
  const [evidence, setEvidence] = useState("");
  const [implication, setImplication] = useState("");
  const [kind, setKind] = useState<SignalKind>("pattern");
  const shown = compact ? activeSignals.slice(0, 5) : activeSignals;

  return (
    <div className="space-y-3">
      {shown.length === 0 ? (
        <EmptyState
          title="No channel signals yet"
          body="Save insights as signals, or capture observations directly. Signals feed Idea Lab context and future strategy."
        />
      ) : (
        <ul className="space-y-2" aria-label="Channel signals">
          {shown.map((s) => (
            <li key={s.id} className="rounded-xl border border-border bg-surface p-3 text-sm">
              <p className="flex flex-wrap items-center gap-1.5 font-medium">
                {s.title}
                <Badge tone="info">{SIGNAL_KINDS.find((k) => k.id === s.kind)?.label ?? s.kind}</Badge>
              </p>
              <p className="mt-0.5 text-xs text-muted-text"><span className="font-medium">Evidence:</span> {s.evidence}</p>
              <p className="text-xs text-muted-text"><span className="font-medium">Implication:</span> {s.implication}</p>
              {!compact && (
                <p className="mt-1.5 flex gap-2 text-xs">
                  <button type="button" onClick={() => archiveSignal(s.id)} className="inline-flex items-center gap-1 text-muted-text underline">
                    <Archive className="size-3.5" aria-hidden="true" />
                    Archive
                  </button>
                  <button type="button" onClick={() => removeSignal(s.id)} className="inline-flex items-center gap-1 text-muted-text underline">
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Delete
                  </button>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {!compact && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim() || !evidence.trim()) return;
            saveSignal({ kind, title: title.trim(), evidence: evidence.trim(), implication: implication.trim() || "Under investigation." });
            setTitle("");
            setEvidence("");
            setImplication("");
          }}
          className="grid gap-2 rounded-xl border border-dashed border-border p-3"
          aria-label="Capture a signal"
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <Input label="Signal title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tutorials hold longer" />
            <label className="text-xs font-medium">Kind
              <select value={kind} onChange={(e) => setKind(e.target.value as SignalKind)} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm">
                {SIGNAL_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>{k.label}</option>
                ))}
              </select>
            </label>
          </div>
          <Textarea label="Evidence" rows={2} value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="8 tutorials vs 6 commentary, watch hours…" />
          <Textarea label="Implication (optional)" rows={2} value={implication} onChange={(e) => setImplication(e.target.value)} placeholder="What might this mean?" />
          <div>
            <Button type="submit" size="sm">Save signal</Button>
          </div>
        </form>
      )}
      {!compact && signals.some((s) => s.status === "archived") && (
        <p className="text-xs text-muted-text">{signals.filter((s) => s.status === "archived").length} archived signal(s) kept for history.</p>
      )}
    </div>
  );
}

/** Alerts: disclosed rules, real signals only. */
export function AlertsPanel({ alerts }: { alerts: { id: string; kind: string; title: string; detail: string; rule: string }[] }) {
  if (alerts.length === 0) {
    return (
      <EmptyState
        title="No alerts"
        body="Alerts fire only from real signals: first log (milestone), ≥50% swings between consecutive logs, and 30-day logging gaps. Nothing here is simulated."
      />
    );
  }
  return (
    <ul className="space-y-2" aria-label="Analytics alerts">
      {alerts.map((a) => (
        <li key={a.id} className="rounded-xl border border-border bg-surface p-3 text-sm">
          <p className="flex flex-wrap items-center gap-1.5 font-medium">
            {a.title}
            <Badge tone={a.kind === "swing" ? "warn" : "info"}>{a.kind}</Badge>
          </p>
          <p className="mt-0.5 text-muted-text">{a.detail}</p>
          <p className="mt-0.5 text-xs text-muted-text">Rule: {a.rule}</p>
        </li>
      ))}
    </ul>
  );
}

/** Reports: CSV download + frozen snapshots. Server rendering stays Phase 11. */
export function ReportsPanel({
  onCsv,
  snapshots,
  onSnapshot,
  onRemoveSnapshot,
}: {
  onCsv: () => void;
  snapshots: { id: string; name: string; at: string; rangeDays: number; entryCount: number; totals: Record<string, number> }[];
  onSnapshot: (name: string) => void;
  onRemoveSnapshot: (id: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section aria-label="Export CSV" className="rounded-xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold">Export CSV</h3>
        <p className="mt-1 text-xs text-muted-text">Every manual entry with dates, platforms, metrics, and provenance. Opens anywhere.</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={onCsv}>
          <Download className="size-4" aria-hidden="true" />
          Download entries.csv
        </Button>
      </section>
      <section aria-label="Snapshots" className="rounded-xl border border-border bg-surface p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Camera className="size-4 text-muted-text" aria-hidden="true" />
          Historical snapshots
        </h3>
        <div className="mt-2 flex gap-1.5">
          <div className="flex-1">
            <Input label="Snapshot name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Q3 review" />
          </div>
          <Button size="sm" className="mt-5" onClick={() => { onSnapshot(name); setName(""); }}>
            Freeze
          </Button>
        </div>
        {snapshots.length === 0 ? (
          <p className="mt-2 text-xs text-muted-text">No snapshots — freeze daily, weekly, or monthly summaries for later comparison.</p>
        ) : (
          <ul className="mt-2 space-y-1.5" aria-label="Saved snapshots">
            {snapshots.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-sm">
                <span>
                  <span className="font-medium">{s.name}</span>{" "}
                  <span className="text-xs text-muted-text">{s.entryCount} entries · {s.rangeDays}d · {new Date(s.at).toLocaleDateString()}</span>
                </span>
                <button type="button" onClick={() => onRemoveSnapshot(s.id)} className="text-xs text-muted-text underline">Delete</button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="lg:col-span-2">
        <MethodologyNote text="Reports assemble local state in your browser. Server-side PDF generation and scheduled summaries belong to Phase 11." />
        <div className="mt-2">
          <LocalStorageNote compact />
        </div>
      </div>
    </div>
  );
}

export function sampleNote(n: number, what: string): string {
  return sampleGate(n, what).message;
}
