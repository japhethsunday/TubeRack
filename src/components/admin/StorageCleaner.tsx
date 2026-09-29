"use client";

import { useEffect, useState } from "react";
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
  const [moving, setMoving] = useState(false);
  const [moveMsg, setMoveMsg] = useState<string | null>(null);
  const [r2, setR2] = useState<{ configured: boolean; reachable: boolean; cors: string; active: boolean } | null>(null);
  const [toggling, setToggling] = useState(false);
  useEffect(() => {
    api.get<typeof r2>("/api/v1/admin/storage?r2=1").then(setR2).catch(() => undefined);
  }, []);
  const toggleR2 = async (active: boolean) => {
    if (active && r2?.cors !== "ok" && !window.confirm("Make sure the bucket's CORS rule is saved first, or uploads and playback will fail. Switch on now?")) return;
    setToggling(true);
    setErr(null);
    try {
      const res = await api.patch<{ active: boolean }>("/api/v1/admin/storage", { active });
      setR2((prev) => (prev ? { ...prev, active: res.active } : prev));
    } catch (e) {
      setErr(errorText(e));
    }
    setToggling(false);
  };

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
      <div className="mt-4 border-t border-border pt-3">
        <p className="text-sm font-semibold">Cloudflare R2</p>
        <p className="text-xs text-muted-text">
          {!r2 ? "Checking…" : !r2.configured ? "Not set up (add the R2 settings in Vercel)." : !r2.reachable ? "Set up, but the bucket can't be reached — check the keys." : `Connected · CORS rule: ${r2.cors === "ok" ? "found" : r2.cors === "missing" ? "missing" : "can't check"} · New files: ${r2.active ? "saved on R2" : "still on Supabase"}`}
        </p>
        {r2?.reachable && (
          <Button size="sm" variant={r2.active ? "outline" : "primary"} className="mt-2 mr-2" loading={toggling} onClick={() => void toggleR2(!r2.active)}>
            {r2.active ? "Switch new files back to Supabase" : "Switch new files to R2"}
          </Button>
        )}
        <p className="mt-2 text-xs text-muted-text">This moves older files from Supabase (a batch of about 4 minutes per tap) — links keep working.</p>
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          loading={moving}
          onClick={async () => {
            setMoving(true);
            setErr(null);
            try {
              const r = await api.put<{ moved: number; movedMb: number; remaining: number; failed: number }>("/api/v1/admin/storage");
              setMoveMsg(`Moved ${r.moved} files (${r.movedMb} MB).${r.remaining ? ` ${r.remaining} left — tap again.` : " All done."}${r.failed ? ` ${r.failed} couldn't be moved.` : ""}`);
            } catch (e) {
              setErr(errorText(e));
            }
            setMoving(false);
          }}
        >
          Move files to Cloudflare R2
        </Button>
        {moveMsg && <p className="mt-2 text-sm text-muted-text">{moveMsg}</p>}
      </div>
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
