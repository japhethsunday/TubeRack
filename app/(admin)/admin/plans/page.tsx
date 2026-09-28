"use client";

import { useState } from "react";
import { api } from "@/src/lib/api";
import { Button } from "@/src/components/ui/Button";
import { cx } from "@/src/components/ui/cx";
import { errorText, Loading, PageTitle, Panel, useAdmin } from "@/src/components/admin/kit";

interface Plan { id: string; name: string; kind: "subscription" | "pack"; priceMinor: number; currency: string; credits: number; description: string; active: boolean; sort: number }
type Draft = Omit<Plan, "id" | "priceMinor"> & { price: string };
const EMPTY: Draft = { name: "", kind: "subscription", price: "", currency: "NGN", credits: 500, description: "", active: true, sort: 0 };
const money = (minor: number, cur: string) => {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: cur }).format(minor / 100);
  } catch {
    return `${cur} ${(minor / 100).toFixed(2)}`;
  }
};

export default function AdminPlans() {
  const { data, error, reload } = useAdmin<Plan[]>("/api/v1/admin/plans");
  const [edit, setEdit] = useState<{ id: string | null; d: Draft } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    if (!edit) return;
    setMsg(null);
    const body = { ...edit.d, priceMinor: Math.round((Number(edit.d.price) || 0) * 100), credits: Math.floor(Number(edit.d.credits) || 0), price: undefined };
    try {
      if (edit.id) await api.patch(`/api/v1/admin/plans/${edit.id}`, body);
      else await api.post("/api/v1/admin/plans", body);
      setEdit(null);
      void reload();
    } catch (e) {
      setMsg(errorText(e));
    }
  }
  async function remove(p: Plan) {
    if (!window.confirm(`Delete "${p.name}"?`)) return;
    try {
      await api.remove(`/api/v1/admin/plans/${p.id}`);
      void reload();
    } catch (e) {
      setMsg(errorText(e));
    }
  }
  const set = (patch: Partial<Draft>) => edit && setEdit({ ...edit, d: { ...edit.d, ...patch } });

  return (
    <>
      <PageTitle
        title="Plans & pricing"
        sub="Monthly plans and one-off credit packs. These are what checkout will offer once payments go live."
        actions={<Button onClick={() => setEdit({ id: null, d: EMPTY })}>Add plan</Button>}
      />
      {msg && <p role="alert" className="mb-3 text-sm text-destructive">{msg}</p>}
      {edit && (
        <Panel title={edit.id ? "Edit plan" : "New plan"} className="mb-4">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <label className="space-y-1"><span className="block text-xs text-muted-text">Name</span><input value={edit.d.name} onChange={(e) => set({ name: e.target.value })} maxLength={60} className="h-10 w-full rounded-lg border border-border bg-background px-2" /></label>
            <label className="space-y-1"><span className="block text-xs text-muted-text">Type</span>
              <select value={edit.d.kind} onChange={(e) => set({ kind: e.target.value as Draft["kind"] })} className="h-10 w-full rounded-lg border border-border bg-background px-2">
                <option value="subscription">Monthly plan (credits every 30 days)</option>
                <option value="pack">Credit pack (one-off)</option>
              </select>
            </label>
            <label className="space-y-1"><span className="block text-xs text-muted-text">Price</span><input type="number" min={0} step="0.01" value={edit.d.price} onChange={(e) => set({ price: e.target.value })} className="h-10 w-full rounded-lg border border-border bg-background px-2" /></label>
            <label className="space-y-1"><span className="block text-xs text-muted-text">Currency</span>
              <select value={edit.d.currency} onChange={(e) => set({ currency: e.target.value })} className="h-10 w-full rounded-lg border border-border bg-background px-2">
                {["NGN", "USD", "GHS", "KES", "ZAR"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className="space-y-1"><span className="block text-xs text-muted-text">Credits</span><input type="number" min={0} value={edit.d.credits} onChange={(e) => set({ credits: Number(e.target.value) })} className="h-10 w-full rounded-lg border border-border bg-background px-2" /></label>
            <label className="space-y-1"><span className="block text-xs text-muted-text">Order</span><input type="number" min={0} value={edit.d.sort} onChange={(e) => set({ sort: Number(e.target.value) })} className="h-10 w-full rounded-lg border border-border bg-background px-2" /></label>
            <label className="space-y-1 sm:col-span-2"><span className="block text-xs text-muted-text">Description</span><input value={edit.d.description} onChange={(e) => set({ description: e.target.value })} maxLength={300} className="h-10 w-full rounded-lg border border-border bg-background px-2" /></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={edit.d.active} onChange={(e) => set({ active: e.target.checked })} className="size-4" /> Available to buy</label>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => void save()} disabled={!edit.d.name.trim()}>Save</Button>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
          </div>
        </Panel>
      )}
      {!data ? <Loading error={error} onRetry={() => void reload()} /> : data.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-text">No plans yet. Add your first monthly plan or credit pack.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((p) => (
            <li key={p.id} className={cx("rounded-xl border bg-surface p-4", p.active ? "border-border" : "border-dashed border-border opacity-70")}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-text">{p.kind === "pack" ? "Credit pack" : "Monthly plan"}{p.active ? "" : " · hidden"}</p>
                  <p className="text-lg font-bold">{p.name}</p>
                </div>
                <p className="text-right text-lg font-bold tabular-nums">{money(p.priceMinor, p.currency)}<span className="block text-xs font-normal text-muted-text">{p.kind === "pack" ? "one-off" : "per month"}</span></p>
              </div>
              <p className="mt-2 text-sm"><strong className="tabular-nums">{p.credits.toLocaleString()}</strong> credits{p.kind === "subscription" ? " every 30 days" : ""}</p>
              {p.description && <p className="mt-1 text-xs text-muted-text">{p.description}</p>}
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEdit({ id: p.id, d: { ...p, price: String(p.priceMinor / 100) } })}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => void remove(p)}>Delete</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
