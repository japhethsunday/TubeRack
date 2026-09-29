"use client";

import { useState } from "react";
import { api, ApiError } from "@/src/lib/api";
import { Button } from "@/src/components/ui/Button";
import { Kpi, Loading, PageTitle, Panel, th, td, useAdmin } from "@/src/components/admin/kit";

interface Affiliate {
  id: string;
  email: string;
  name: string;
  code: string;
  status: string;
  commissionPct: number;
  website: string;
  audience: string;
  payoutDetails: string;
  clicks: number;
  signups: number;
  owed: number;
  paid: number;
  createdAt: string;
}
interface Commission { id: string; code: string; customer: string; sale: number; commission: number; currency: string; status: string; note: string; createdAt: string }

const money = (n: number, c = "USD") => new Intl.NumberFormat(undefined, { style: "currency", currency: c }).format(n);

export default function AdminAffiliates() {
  const { data, error, reload } = useAdmin<{ affiliates: Affiliate[]; commissions: Commission[] }>("/api/v1/admin/affiliates");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sale, setSale] = useState({ email: "", amount: "", currency: "USD", note: "" });
  const [busy, setBusy] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setMsg(null);
    try {
      await api.patch("/api/v1/admin/affiliates", body);
      await reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Couldn't save." });
    }
    setBusy(null);
  }

  async function recordSale() {
    setBusy("sale");
    setMsg(null);
    try {
      const r = await api.post<{ commission: number }>("/api/v1/admin/affiliates", { email: sale.email, amount: Number(sale.amount), currency: sale.currency, note: sale.note });
      setMsg({ ok: true, text: `Sale recorded — commission ${money(r.commission, sale.currency)} is pending.` });
      setSale({ email: "", amount: "", currency: sale.currency, note: "" });
      await reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Couldn't record the sale." });
    }
    setBusy(null);
  }

  const aff = data?.affiliates ?? [];
  const owed = aff.reduce((n, a) => n + a.owed, 0);
  return (
    <>
      <PageTitle title="Affiliates" sub="Partners who promote Recktube for a cash commission on the customers they bring in." />
      {!data ? <Loading error={error} onRetry={() => void reload()} /> : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Affiliates" value={aff.filter((a) => a.status === "approved").length} />
            <Kpi label="Waiting for review" value={aff.filter((a) => a.status === "pending").length} tone={aff.some((a) => a.status === "pending") ? "good" : undefined} />
            <Kpi label="Sign-ups from affiliates" value={aff.reduce((n, a) => n + a.signups, 0)} />
            <Kpi label="Commission owed" value={money(owed)} />
          </div>

          {msg && <p role="status" className={msg.ok ? "rounded-lg bg-success/10 p-3 text-sm text-success" : "rounded-lg bg-destructive/10 p-3 text-sm text-destructive"}>{msg.text}</p>}

          <Panel title="Partners">
            {aff.length === 0 ? <p className="text-sm text-muted-text">No applications yet. Creators apply from the Invite page.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr><th className={th}>Partner</th><th className={th}>Link</th><th className={th}>Audience</th><th className={`${th} text-right`}>Clicks</th><th className={`${th} text-right`}>Sign-ups</th><th className={`${th} text-right`}>Owed / paid</th><th className={th}>%</th><th className={th}>Status</th></tr></thead>
                  <tbody>
                    {aff.map((a) => (
                      <tr key={a.id} className="border-t border-border align-top">
                        <td className={td}><div className="font-medium">{a.name || a.email}</div><div className="text-xs text-muted-text">{a.email}</div>{a.payoutDetails && <div className="text-xs text-muted-text">Pay: {a.payoutDetails}</div>}</td>
                        <td className={td}><code className="text-xs">/go/{a.code}</code>{a.website && <div><a href={a.website} target="_blank" rel="noreferrer noopener" className="text-xs text-primary hover:underline">{a.website.replace(/^https?:\/\//, "").slice(0, 40)}</a></div>}</td>
                        <td className={`${td} max-w-64 text-xs text-muted-text`}>{a.audience}</td>
                        <td className={`${td} text-right tabular-nums`}>{a.clicks}</td>
                        <td className={`${td} text-right tabular-nums`}>{a.signups}</td>
                        <td className={`${td} text-right tabular-nums`}>{money(a.owed)} / {money(a.paid)}</td>
                        <td className={td}>
                          <input
                            type="number"
                            min={0}
                            max={90}
                            defaultValue={a.commissionPct}
                            aria-label={`Commission for ${a.email}`}
                            onBlur={(e) => Number(e.target.value) !== a.commissionPct && void patch({ affiliateId: a.id, commissionPct: Math.max(0, Math.min(90, Math.round(Number(e.target.value)))) }, a.id)}
                            className="h-8 w-16 rounded-md border border-border bg-background px-2 text-sm"
                          />
                        </td>
                        <td className={td}>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs capitalize">{a.status}</span>
                            {a.status !== "approved" && <Button size="sm" loading={busy === a.id} onClick={() => void patch({ affiliateId: a.id, status: "approved" }, a.id)}>Approve</Button>}
                            {a.status === "pending" && <Button size="sm" variant="outline" onClick={() => void patch({ affiliateId: a.id, status: "rejected" }, a.id)}>Reject</Button>}
                            {a.status === "approved" && <Button size="sm" variant="outline" onClick={() => void patch({ affiliateId: a.id, status: "paused" }, a.id)}>Pause</Button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Record a sale">
            <p className="mb-3 text-sm text-muted-text">When a customer who signed up through an affiliate pays you, record it here. The affiliate&apos;s commission is calculated automatically.</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_6rem_2fr_auto]">
              <input value={sale.email} onChange={(e) => setSale({ ...sale, email: e.target.value })} placeholder="Customer email" aria-label="Customer email" className="h-10 rounded-lg border border-border bg-background px-3 text-sm" />
              <input value={sale.amount} onChange={(e) => setSale({ ...sale, amount: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="Amount paid" aria-label="Amount paid" inputMode="decimal" className="h-10 rounded-lg border border-border bg-background px-3 text-sm" />
              <input value={sale.currency} onChange={(e) => setSale({ ...sale, currency: e.target.value.toUpperCase().slice(0, 3) })} aria-label="Currency" className="h-10 rounded-lg border border-border bg-background px-3 text-sm" />
              <input value={sale.note} onChange={(e) => setSale({ ...sale, note: e.target.value })} placeholder="Note (e.g. Pro plan, March)" aria-label="Note" className="h-10 rounded-lg border border-border bg-background px-3 text-sm" />
              <Button className="h-10" loading={busy === "sale"} disabled={!sale.email || !Number(sale.amount)} onClick={() => void recordSale()}>Record</Button>
            </div>
          </Panel>

          <Panel title="Commissions">
            {data.commissions.length === 0 ? <p className="text-sm text-muted-text">No commissions yet.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr><th className={th}>Date</th><th className={th}>Affiliate</th><th className={th}>Customer</th><th className={`${th} text-right`}>Sale</th><th className={`${th} text-right`}>Commission</th><th className={th}>Status</th></tr></thead>
                  <tbody>
                    {data.commissions.map((c) => (
                      <tr key={c.id} className="border-t border-border">
                        <td className={td}>{new Date(c.createdAt).toLocaleDateString()}</td>
                        <td className={td}>/go/{c.code}</td>
                        <td className={td}>{c.customer}{c.note && <div className="text-xs text-muted-text">{c.note}</div>}</td>
                        <td className={`${td} text-right tabular-nums`}>{money(c.sale, c.currency)}</td>
                        <td className={`${td} text-right tabular-nums`}>{money(c.commission, c.currency)}</td>
                        <td className={td}>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs capitalize">{c.status}</span>
                            {c.status === "pending" && <Button size="sm" variant="outline" onClick={() => void patch({ commissionId: c.id, status: "approved" }, c.id)}>Approve</Button>}
                            {(c.status === "pending" || c.status === "approved") && <Button size="sm" loading={busy === c.id} onClick={() => void patch({ commissionId: c.id, status: "paid" }, c.id)}>Mark paid</Button>}
                            {c.status !== "paid" && c.status !== "void" && <Button size="sm" variant="ghost" onClick={() => void patch({ commissionId: c.id, status: "void" }, c.id)}>Void</Button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
