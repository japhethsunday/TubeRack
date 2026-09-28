"use client";

import Link from "next/link";
import { useState } from "react";
import { cx } from "@/src/components/ui/cx";
import { Kpi, Loading, PageTitle, Panel, th, td, useAdmin, when } from "@/src/components/admin/kit";

interface Item { id: string; source: string; kind: string; provider: string; detail: string; userId: string | null; email: string; createdAt: string }
interface Data { summary: { kind: string; failed: number; total: number; rate: number }[]; items: Item[] }
const RANGES = [1, 7, 30] as const;

export default function AdminFailed() {
  const [days, setDays] = useState<number>(7);
  const { data, error, reload } = useAdmin<Data>(`/api/v1/admin/failed?days=${days}`);
  const failed = data?.summary.reduce((s, r) => s + r.failed, 0) ?? 0;
  const total = data?.summary.reduce((s, r) => s + r.total, 0) ?? 0;
  return (
    <>
      <PageTitle
        title="Failed jobs"
        sub="Every failed generation and background job, so you can spot problems before users report them."
        actions={RANGES.map((d) => (
          <button key={d} onClick={() => setDays(d)} className={cx("rounded-full border px-3 py-1 text-xs font-medium", days === d ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-text")}>
            {d === 1 ? "24 hours" : `${d} days`}
          </button>
        ))}
      />
      {!data ? <Loading error={error} onRetry={() => void reload()} /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Failed" value={failed} tone={failed ? "bad" : "good"} />
            <Kpi label="All generations" value={total} />
            <Kpi label="Failure rate" value={`${total ? Math.round((failed / total) * 1000) / 10 : 0}%`} tone={total && failed / total > 0.1 ? "bad" : undefined} />
            <Kpi label="Users affected" value={new Set(data.items.map((i) => i.email).filter(Boolean)).size} />
          </div>
          {data.summary.some((s) => s.failed) && (
            <Panel title="By tool">
              <ul className="grid gap-2 sm:grid-cols-3">
                {data.summary.filter((s) => s.failed).map((s) => (
                  <li key={s.kind} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                    <span className="font-medium capitalize">{s.kind}</span>
                    <span className={cx("tabular-nums", s.rate > 10 ? "text-destructive" : "text-muted-text")}>{s.failed}/{s.total} · {s.rate}%</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {data.items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-text">Nothing failed in this period. 🎉</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full min-w-[720px] text-sm">
                <thead><tr><th className={th}>When</th><th className={th}>User</th><th className={th}>Tool</th><th className={th}>Provider</th><th className={th}>Details</th></tr></thead>
                <tbody>
                  {data.items.map((i) => (
                    <tr key={`${i.source}-${i.id}`} className="border-t border-border">
                      <td className={`${td} whitespace-nowrap text-xs text-muted-text`}>{when(i.createdAt)}</td>
                      <td className={`${td} text-xs`}>{i.userId ? <Link href={`/admin/users/${i.userId}`} className="hover:text-primary hover:underline">{i.email}</Link> : "—"}</td>
                      <td className={`${td} text-xs capitalize`}>{i.kind}{i.source === "job" ? " (job)" : ""}</td>
                      <td className={`${td} text-xs text-muted-text`}>{i.provider || "—"}</td>
                      <td className={`${td} max-w-md text-xs text-muted-text`}>{i.detail || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-text">Failed generations are never charged. To make it up to someone, open their account and add credits — they get an email automatically.</p>
        </div>
      )}
    </>
  );
}
