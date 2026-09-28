"use client";

import { useState } from "react";
import { api } from "@/src/lib/api";
import { Button } from "@/src/components/ui/Button";
import { cx } from "@/src/components/ui/cx";
import { errorText, Kpi, Loading, PageTitle, Panel, th, td, useAdmin, when } from "@/src/components/admin/kit";

interface Code { code: string; credits: number; note: string; expiresAt: string | null; maxUses: number | null; uses: number; active: boolean; createdAt: string }
interface Data { codes: Code[]; personal: { made: number; used: number } }

export default function AdminCodes() {
  const { data, error, reload } = useAdmin<Data>("/api/v1/admin/codes");
  const [form, setForm] = useState({ code: "", credits: "50", note: "", days: "30", max: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function create() {
    setMsg(null);
    try {
      await api.post("/api/v1/admin/codes", {
        code: form.code,
        credits: Math.floor(Number(form.credits) || 0),
        note: form.note,
        expiresInDays: form.days ? Math.floor(Number(form.days)) : null,
        maxUses: form.max ? Math.floor(Number(form.max)) : null,
      });
      setMsg({ ok: true, text: `Created. Share it as ${window.location.origin}/redeem?code=${form.code.toUpperCase()}` });
      setForm({ ...form, code: "", note: "" });
      void reload();
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  }
  async function toggle(c: Code) {
    await api.patch("/api/v1/admin/codes", { code: c.code, active: !c.active }).catch(() => {});
    void reload();
  }
  const input = "h-10 w-full rounded-lg border border-border bg-background px-2 text-sm";

  return (
    <>
      <PageTitle title="Bonus codes" sub="Free-credit codes for promotions, giveaways and emails. Each person can use a code once." />
      <Panel title="Create a code" className="mb-4">
        <div className="grid gap-3 sm:grid-cols-5">
          <label className="space-y-1 sm:col-span-2"><span className="block text-xs text-muted-text">Code</span><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="CREATOR50" className={cx(input, "font-mono font-bold tracking-wider")} /></label>
          <label className="space-y-1"><span className="block text-xs text-muted-text">Credits</span><input type="number" min={1} value={form.credits} onChange={(e) => setForm({ ...form, credits: e.target.value })} className={input} /></label>
          <label className="space-y-1"><span className="block text-xs text-muted-text">Expires in (days)</span><input type="number" min={1} value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} placeholder="never" className={input} /></label>
          <label className="space-y-1"><span className="block text-xs text-muted-text">Max uses</span><input type="number" min={1} value={form.max} onChange={(e) => setForm({ ...form, max: e.target.value })} placeholder="unlimited" className={input} /></label>
          <label className="space-y-1 sm:col-span-4"><span className="block text-xs text-muted-text">Note (for you)</span><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={200} placeholder="e.g. Instagram giveaway" className={input} /></label>
          <div className="flex items-end"><Button className="w-full justify-center" disabled={form.code.trim().length < 3 || !Number(form.credits)} onClick={() => void create()}>Create</Button></div>
        </div>
        {msg && <p className={cx("mt-2 break-all text-sm", msg.ok ? "text-success" : "text-destructive")}>{msg.text}</p>}
      </Panel>
      {!data ? <Loading error={error} onRetry={() => void reload()} /> : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Public codes" value={data.codes.length} />
            <Kpi label="Redemptions (public)" value={data.codes.reduce((n, c) => n + c.uses, 0)} />
            <Kpi label="Personal offer codes sent" value={data.personal.made} />
            <Kpi label="Personal codes used" value={data.personal.used} tone={data.personal.used ? "good" : undefined} />
          </div>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr><th className={th}>Code</th><th className={`${th} text-right`}>Credits</th><th className={th}>Used</th><th className={th}>Expires</th><th className={th}>Note</th><th className={th}>Status</th></tr></thead>
              <tbody>
                {data.codes.map((c) => (
                  <tr key={c.code} className="border-t border-border">
                    <td className={`${td} font-mono font-bold`}>{c.code}</td>
                    <td className={`${td} text-right tabular-nums`}>+{c.credits}</td>
                    <td className={`${td} tabular-nums`}>{c.uses}{c.maxUses ? ` / ${c.maxUses}` : ""}</td>
                    <td className={`${td} text-xs text-muted-text`}>{c.expiresAt ? when(c.expiresAt) : "Never"}</td>
                    <td className={`${td} text-xs text-muted-text`}>{c.note || "—"}</td>
                    <td className={td}><button onClick={() => void toggle(c)} className={cx("rounded-full px-2.5 py-0.5 text-xs font-semibold", c.active ? "bg-success/15 text-success" : "bg-muted text-muted-text")}>{c.active ? "Active" : "Off"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
