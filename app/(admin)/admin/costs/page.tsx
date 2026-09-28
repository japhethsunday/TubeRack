"use client";

import { useEffect, useState } from "react";
import { api } from "@/src/lib/api";
import { Button } from "@/src/components/ui/Button";
import { cx } from "@/src/components/ui/cx";
import { errorText, Kpi, Loading, PageTitle, Panel, th, td, useAdmin } from "@/src/components/admin/kit";

interface Data { rates: Record<string, number>; kinds: { kind: string; ok: number; failed: number; rate: number; cost: number; creditsEach: number }[]; totalCost: number; creditsSpent: number; daily: { day: string; cost: number }[] }
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AdminCosts() {
  const [days, setDays] = useState(30);
  const { data, error, reload } = useAdmin<Data>(`/api/v1/admin/costs?days=${days}`);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- editable copy of the loaded rates.
    if (data) setRates(Object.fromEntries(Object.entries(data.rates).map(([k, v]) => [k, String(v)])));
  }, [data]);
  const max = Math.max(0.01, ...(data?.daily.map((d) => d.cost) ?? [0]));

  async function save() {
    setMsg(null);
    try {
      await api.put("/api/v1/admin/costs", { rates: Object.fromEntries(Object.entries(rates).map(([k, v]) => [k, Math.max(0, Number(v) || 0)])) });
      setMsg("Saved.");
      void reload();
    } catch (e) {
      setMsg(errorText(e));
    }
  }

  return (
    <>
      <PageTitle
        title="AI costs"
        sub="Estimated provider spend from real usage, next to the credits people spent. Adjust the rates to match your bills."
        actions={[7, 30, 90].map((d) => (
          <button key={d} onClick={() => setDays(d)} className={cx("rounded-full border px-3 py-1 text-xs font-medium", days === d ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-text")}>{d} days</button>
        ))}
      />
      {!data ? <Loading error={error} onRetry={() => void reload()} /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Estimated spend" value={usd(data.totalCost)} />
            <Kpi label="Per day (avg)" value={usd(data.totalCost / days)} />
            <Kpi label="Credits spent" value={data.creditsSpent} hint="By users (unlimited accounts aren't charged)" />
            <Kpi label="Cost per credit" value={data.creditsSpent ? usd(data.totalCost / data.creditsSpent) : "—"} hint="Price credits above this" />
          </div>
          {data.daily.length > 0 && (
            <Panel title="Daily spend">
              <div className="flex h-32 items-end gap-1">
                {data.daily.map((d) => (
                  <div key={d.day} title={`${d.day}: ${usd(d.cost)}`} className="flex-1 rounded-t bg-gradient-to-t from-violet-600 to-fuchsia-500" style={{ height: `${Math.max(2, (d.cost / max) * 100)}%` }} />
                ))}
              </div>
            </Panel>
          )}
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr><th className={th}>Tool</th><th className={`${th} text-right`}>Successful</th><th className={`${th} text-right`}>Failed</th><th className={`${th} text-right`}>Credits each</th><th className={`${th} text-right`}>Est. cost</th></tr></thead>
              <tbody>
                {data.kinds.map((k) => (
                  <tr key={k.kind} className="border-t border-border">
                    <td className={`${td} font-medium capitalize`}>{k.kind}</td>
                    <td className={`${td} text-right tabular-nums`}>{k.ok.toLocaleString()}</td>
                    <td className={`${td} text-right tabular-nums text-muted-text`}>{k.failed.toLocaleString()}</td>
                    <td className={`${td} text-right tabular-nums`}>{k.creditsEach}</td>
                    <td className={`${td} text-right tabular-nums`}>{usd(k.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Panel title="Cost per generation (USD)" right={<Button size="sm" onClick={() => void save()}>Save rates</Button>}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Object.keys(rates).map((k) => (
                <label key={k} className="space-y-1 text-sm">
                  <span className="block text-xs capitalize text-muted-text">{k}</span>
                  <input type="number" step="0.001" min={0} value={rates[k]} onChange={(e) => setRates({ ...rates, [k]: e.target.value })} className="h-9 w-full rounded-lg border border-border bg-background px-2" />
                </label>
              ))}
            </div>
            {msg && <p className="mt-2 text-xs text-muted-text">{msg}</p>}
          </Panel>
        </div>
      )}
    </>
  );
}
