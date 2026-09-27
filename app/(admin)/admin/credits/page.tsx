"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/src/components/ui/Button";
import { CreditEditor, Kpi, Loading, PageTitle, Panel, th, td, useAdmin, when } from "@/src/components/admin/kit";

interface Account { workspaceId: string; workspace: string; email: string; balance: number; monthlyGrant: number; unlimited: boolean; refilledAt: string | null; spent30: number }
const COSTS = [["Text / ideas / scripts", 1], ["Research", 2], ["Transcription", 3], ["Voice-over", 3], ["Image", 5], ["AI video clip", 20]] as const;

export default function AdminCredits() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const { data, error, reload } = useAdmin<{ totals: { balance: number; empty: number; unlimited: number }; accounts: Account[] }>(`/api/v1/admin/credits?${new URLSearchParams({ q: query })}`);
  return (
    <>
      <PageTitle title="Credits" sub="Every account gets a monthly allowance (default 500). Generation pauses at zero until the next refill or a top-up from you." />
      {!data ? <Loading error={error} onRetry={() => void reload()} /> : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Credits held by users" value={data.totals.balance} />
            <Kpi label="Accounts at zero" value={data.totals.empty} tone={data.totals.empty ? "bad" : undefined} />
            <Kpi label="Unlimited accounts" value={data.totals.unlimited} />
            <Kpi label="Accounts" value={data.accounts.length} />
          </div>
          <Panel title="What things cost">
            <div className="flex flex-wrap gap-2 text-xs">{COSTS.map(([k, v]) => <span key={k} className="rounded-full border border-border px-2.5 py-1">{k}: <b>{v}</b></span>)}</div>
          </Panel>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-text" aria-hidden="true" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search owner email or workspace" aria-label="Search accounts" className="h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm" />
            </div>
            <Button type="submit">Search</Button>
          </form>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr><th className={th}>Owner</th><th className={`${th} text-right`}>Balance</th><th className={`${th} text-right`}>Monthly limit</th><th className={`${th} text-right`}>Spent (30d)</th><th className={th}>Last refill</th><th className={th} /></tr></thead>
              <tbody>
                {data.accounts.map((a) => (
                  <Fragment key={a.workspaceId}>
                    <tr className="border-t border-border">
                      <td className={td}><div className="font-semibold">{a.email || "—"}</div><div className="text-xs text-muted-text">{a.workspace}</div></td>
                      <td className={`${td} text-right font-semibold tabular-nums ${a.balance === 0 && !a.unlimited ? "text-destructive" : ""}`}>{a.unlimited ? "∞" : a.balance.toLocaleString()}</td>
                      <td className={`${td} text-right tabular-nums`}>{a.monthlyGrant.toLocaleString()}</td>
                      <td className={`${td} text-right tabular-nums`}>{a.spent30.toLocaleString()}</td>
                      <td className={`${td} whitespace-nowrap text-xs text-muted-text`}>{when(a.refilledAt)}</td>
                      <td className={`${td} text-right`}><Button size="sm" variant={open === a.workspaceId ? "primary" : "outline"} onClick={() => setOpen(open === a.workspaceId ? null : a.workspaceId)}>Manage</Button></td>
                    </tr>
                    {open === a.workspaceId && (
                      <tr className="bg-muted/30"><td colSpan={6} className="p-4"><CreditEditor workspaceId={a.workspaceId} balance={a.balance} monthlyGrant={a.monthlyGrant} unlimited={a.unlimited} onDone={() => void reload()} /></td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-text">Tip: open a user from <Link href="/admin/users" className="text-primary hover:underline">Users</Link> to see their full credit history.</p>
        </div>
      )}
    </>
  );
}
