"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/src/components/ui/Badge";
import { Button } from "@/src/components/ui/Button";
import { cx } from "@/src/components/ui/cx";
import { Loading, PageTitle, th, td, useAdmin, when } from "@/src/components/admin/kit";

interface Row { kind: string; status: string; provider: string; model: string; email: string; createdAt: string }

export default function AdminUsage() {
  const [status, setStatus] = useState("");
  const { data, error, loading, reload } = useAdmin<Row[]>(`/api/v1/admin/usage?status=${status}`);
  return (
    <>
      <PageTitle title="Generations" sub="The latest 100 AI generations across the app — spot failures fast." actions={<Button size="sm" variant="outline" loading={loading} onClick={() => void reload()}><RefreshCw className="size-4" aria-hidden="true" /> Refresh</Button>} />
      <div className="mb-4 flex gap-1">
        {[["", "All"], ["completed", "Succeeded"], ["failed", "Failed"]].map(([v, l]) => (
          <button key={v} onClick={() => setStatus(v)} className={cx("rounded-full border px-3 py-1 text-xs font-medium", status === v ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-text hover:text-foreground")}>{l}</button>
        ))}
      </div>
      {!data ? <Loading error={error} onRetry={() => void reload()} /> : data.length === 0 ? <p className="text-sm text-muted-text">Nothing here yet.</p> : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr><th className={th}>When</th><th className={th}>User</th><th className={th}>Type</th><th className={th}>Engine</th><th className={th}>Result</th></tr></thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  <td className={`${td} whitespace-nowrap text-xs text-muted-text`}>{when(r.createdAt)}</td>
                  <td className={`${td} text-xs`}>{r.email || "—"}</td>
                  <td className={`${td} capitalize`}>{r.kind}</td>
                  <td className={`${td} text-xs text-muted-text`}>{r.model || r.provider}</td>
                  <td className={td}><Badge tone={r.status === "completed" ? "ok" : "bad"}>{r.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
