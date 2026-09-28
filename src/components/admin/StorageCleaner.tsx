"use client";

import { useState } from "react";
import { HardDrive } from "lucide-react";
import { api } from "@/src/lib/api";
import { Button } from "@/src/components/ui/Button";
import { errorText, Kpi, Panel } from "@/src/components/admin/kit";

interface Report { scanned: number; unused: number; freedMb: number; deleted: number; deletedAccounts: number; dryRun: boolean; graceDays: number }

/** Preview and run the storage cleaner (it also runs automatically every day). */
export function StorageCleaner() {
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState<"check" | "clean" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [days, setDays] = useState(7);

  const run = async (kind: "check" | "clean") => {
    if (kind === "clean" && !window.confirm(`Delete ${report?.unused ?? "all"} unused files now? Files still used anywhere are never touched.`)) return;
    setBusy(kind);
    setErr(null);
    try {
      setReport(kind === "check" ? await api.get<Report>(`/api/v1/admin/storage?days=${days}`) : await api.post<Report>(`/api/v1/admin/storage?days=${days}`));
    } catch (e) {
      setErr(errorText(e));
    }
    setBusy(null);
  };

  return (
    <Panel title="Storage cleaner" right={<HardDrive className="size-4 text-muted-text" aria-hidden="true" />}>
      <p className="text-sm text-muted-text">
        Removes files nothing uses any more (clips dropped from projects, leftovers from regenerated videos, files of deleted accounts) once they&apos;re
        older than the waiting period you pick. Anything still used anywhere is kept. Also runs automatically every day (14-day wait).
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          Unused for at least
          <select value={days} onChange={(e) => { setDays(Number(e.target.value)); setReport(null); }} className="h-9 rounded-lg border border-border bg-background px-2">
            {[3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </label>
        <Button size="sm" variant="outline" loading={busy === "check"} onClick={() => void run("check")}>Check (no deleting)</Button>
        <Button size="sm" loading={busy === "clean"} disabled={!report || report.unused === 0} onClick={() => void run("clean")}>Clean now</Button>
      </div>
      {err && <p role="alert" className="mt-2 text-sm text-destructive">{err}</p>}
      {report && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Files checked" value={report.scanned} />
          <Kpi label={report.dryRun ? "Can be removed" : "Removed"} value={report.dryRun ? report.unused : report.deleted} tone={report.unused ? "bad" : "good"} />
          <Kpi label={report.dryRun ? "Space to free" : "Space freed"} value={`${report.freedMb.toLocaleString()} MB`} />
          <Kpi label="Deleted accounts' folders" value={report.deletedAccounts} />
        </div>
      )}
    </Panel>
  );
}
