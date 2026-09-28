"use client";

import { useState } from "react";
import { cx } from "@/src/components/ui/cx";
import { Kpi, Loading, PageTitle, Panel, th, td, useAdmin, when } from "@/src/components/admin/kit";

interface Tx { reference: string; status: string; amount: number; currency: string; email: string; channel: string; paidAt: string | null; message: string }
type Data = { connected: false } | { connected: true; error?: string; transactions?: Tx[]; totals?: Record<string, { success: number; failed: number; count: number }> };
const money = (n: number, cur: string) => {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${cur} ${n.toFixed(2)}`;
  }
};

export default function AdminRevenue() {
  const [days, setDays] = useState(30);
  const { data, error, reload } = useAdmin<Data>(`/api/v1/admin/revenue?days=${days}`);
  return (
    <>
      <PageTitle
        title="Revenue"
        sub="Payments from Paystack: what came in, what failed, and who paid."
        actions={[7, 30, 90].map((d) => (
          <button key={d} onClick={() => setDays(d)} className={cx("rounded-full border px-3 py-1 text-xs font-medium", days === d ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-text")}>{d} days</button>
        ))}
      />
      {!data ? <Loading error={error} onRetry={() => void reload()} /> : !data.connected ? (
        <Panel title="Connect Paystack">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm">
            <li>In Paystack, open <strong>Settings → API Keys &amp; Webhooks</strong> and copy the <strong>Secret key</strong>.</li>
            <li>In Vercel, add it as the environment variable <code className="rounded bg-muted px-1">PAYSTACK_SECRET_KEY</code> (Production).</li>
            <li>Redeploy — this page then shows your live payments.</li>
          </ol>
        </Panel>
      ) : data.error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{data.error}</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(data.totals ?? {}).map(([cur, t]) => (
              <Kpi key={cur} label={`Received (${cur})`} value={money(t.success, cur)} tone="good" hint={`${t.count} transactions`} />
            ))}
            {Object.entries(data.totals ?? {}).map(([cur, t]) => (
              <Kpi key={`f-${cur}`} label={`Failed / abandoned (${cur})`} value={money(t.failed, cur)} tone={t.failed ? "bad" : undefined} />
            ))}
            {!Object.keys(data.totals ?? {}).length && <Kpi label="Received" value="—" hint="No payments in this period" />}
          </div>
          {(data.transactions ?? []).length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full min-w-[720px] text-sm">
                <thead><tr><th className={th}>Customer</th><th className={th}>When</th><th className={`${th} text-right`}>Amount</th><th className={th}>Status</th><th className={th}>Method</th><th className={th}>Reference</th></tr></thead>
                <tbody>
                  {data.transactions!.map((t) => (
                    <tr key={t.reference} className="border-t border-border">
                      <td className={`${td} text-xs`}>{t.email || "—"}</td>
                      <td className={`${td} whitespace-nowrap text-xs text-muted-text`}>{when(t.paidAt)}</td>
                      <td className={`${td} text-right tabular-nums`}>{money(t.amount, t.currency)}</td>
                      <td className={cx(td, "text-xs font-semibold capitalize", t.status === "success" ? "text-success" : t.status === "failed" ? "text-destructive" : "text-muted-text")} title={t.message}>{t.status}</td>
                      <td className={`${td} text-xs capitalize text-muted-text`}>{t.channel || "—"}</td>
                      <td className={`${td} font-mono text-[11px] text-muted-text`}>{t.reference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
