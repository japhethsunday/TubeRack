"use client";

import { useState } from "react";
import { cx } from "@/src/components/ui/cx";
import { Loading, PageTitle, th, td, useAdmin, when } from "@/src/components/admin/kit";

interface Row { id: string; action: string; resource: string; email: string; createdAt: string }
const FILTERS = [["", "Everything"], ["admin", "Admin actions"], ["admin.denied", "Blocked attempts"], ["auth", "Sign-ins"], ["credits", "Credits"]] as const;

export default function AdminSecurity() {
  const [action, setAction] = useState("");
  const { data, error, reload } = useAdmin<Row[]>(`/api/v1/admin/audit?action=${action}`);
  return (
    <>
      <PageTitle title="Security log" sub="Every admin action and every blocked attempt to reach the admin area." />
      <div className="mb-4 flex flex-wrap gap-1">
        {FILTERS.map(([v, l]) => (
          <button key={v} onClick={() => setAction(v)} className={cx("rounded-full border px-3 py-1 text-xs font-medium", action === v ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-text hover:text-foreground")}>{l}</button>
        ))}
      </div>
      {!data ? <Loading error={error} onRetry={() => void reload()} /> : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[600px] text-sm">
            <thead><tr><th className={th}>When</th><th className={th}>Who</th><th className={th}>Action</th><th className={th}>Target</th></tr></thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className={`${td} whitespace-nowrap text-xs text-muted-text`}>{when(a.createdAt)}</td>
                  <td className={`${td} text-xs`}>{a.email || "—"}</td>
                  <td className={cx(td, "font-mono text-xs", a.action.includes("denied") && "text-destructive")}>{a.action}</td>
                  <td className={`${td} text-xs text-muted-text`}>{a.resource}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
