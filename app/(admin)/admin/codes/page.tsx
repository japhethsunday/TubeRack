"use client";

import { useState } from "react";
import { Trash2, User, Users } from "lucide-react";
import { api } from "@/src/lib/api";
import { Button } from "@/src/components/ui/Button";
import { cx } from "@/src/components/ui/cx";
import { errorText, Kpi, Loading, PageTitle, Panel, useAdmin, when } from "@/src/components/admin/kit";

type Kind = "group" | "individual";
interface Code {
  code: string;
  kind: Kind;
  credits: number;
  note: string;
  forEmail: string | null;
  maxUses: number | null;
  uses: number;
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
  status: string;
  redemptions: { email: string; at: string }[];
}

const STATUS_TONE: Record<string, string> = {
  Active: "bg-success/15 text-success",
  Redeemed: "bg-violet-500/15 text-violet-300",
  "Fully used": "bg-sky-500/15 text-sky-300",
  Expired: "bg-amber-500/15 text-amber-300",
  Off: "bg-muted text-muted-text",
};

export default function AdminCodes() {
  const { data, error, reload } = useAdmin<{ codes: Code[] }>("/api/v1/admin/codes");
  const [kind, setKind] = useState<Kind>("group");
  const [form, setForm] = useState({ code: "", credits: "50", note: "", days: "30", max: "100", email: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setMsg(null);
    setBusy(true);
    try {
      const out = await api.post<{ code: string; forEmail: string | null }>("/api/v1/admin/codes", {
        kind,
        code: form.code,
        email: kind === "individual" ? form.email : "",
        credits: Math.floor(Number(form.credits) || 0),
        note: form.note,
        expiresInDays: form.days ? Math.floor(Number(form.days)) : null,
        maxUses: kind === "group" && form.max ? Math.floor(Number(form.max)) : null,
      });
      setMsg({ ok: true, text: `Created ${out.code}${out.forEmail ? ` for ${out.forEmail}` : ""}. Link: ${window.location.origin}/redeem?code=${out.code}` });
      setForm({ ...form, code: "", note: "", email: "" });
      void reload();
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
    setBusy(false);
  }
  async function toggle(c: Code) {
    await api.patch("/api/v1/admin/codes", { code: c.code, active: !c.active }).catch(() => {});
    void reload();
  }
  async function remove(c: Code) {
    if (!window.confirm(`Delete ${c.code}? People who already redeemed it keep their credits.`)) return;
    try {
      await api.remove(`/api/v1/admin/codes?code=${encodeURIComponent(c.code)}`);
      setMsg({ ok: true, text: `Deleted ${c.code}.` });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
    void reload();
  }
  const input = "h-11 w-full rounded-xl border border-border bg-background px-3 text-base sm:h-10 sm:text-sm";
  const label = "block text-xs font-medium text-muted-text";
  const codes = data?.codes ?? [];

  return (
    <>
      <PageTitle title="Bonus codes" sub="Free-credit codes. Group codes can be used by a set number of people; individual codes work for one account only. Each person can use a code once." />
      <Panel title="Create a code" className="mb-4">
        <div role="radiogroup" aria-label="Code type" className="mb-4 grid grid-cols-2 gap-2">
          {([
            ["group", Users, "Group code", "Many people, each once"],
            ["individual", User, "Individual code", "One person only"],
          ] as const).map(([k, Icon, t, d]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={cx("flex items-center gap-3 rounded-xl border p-3 text-left transition", kind === k ? "border-violet-400/60 bg-violet-500/10" : "border-border hover:bg-white/5")}>
              <Icon className={cx("size-5 shrink-0", kind === k ? "text-violet-300" : "text-muted-text")} aria-hidden="true" />
              <span><span className="block text-sm font-semibold">{t}</span><span className="block text-xs text-muted-text">{d}</span></span>
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          {kind === "individual" && (
            <label className="space-y-1 sm:col-span-2"><span className={label}>Person's email</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@example.com" className={input} /></label>
          )}
          <label className={cx("space-y-1", kind === "group" ? "sm:col-span-2" : "sm:col-span-2")}><span className={label}>Code (leave empty for a random one)</span><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder={kind === "group" ? "CREATOR50" : "auto"} className={cx(input, "font-mono font-bold tracking-wider")} /></label>
          <label className="space-y-1"><span className={label}>Credits each</span><input type="number" min={1} value={form.credits} onChange={(e) => setForm({ ...form, credits: e.target.value })} className={input} /></label>
          {kind === "group" && (
            <label className="space-y-1"><span className={label}>How many people</span><input type="number" min={1} value={form.max} onChange={(e) => setForm({ ...form, max: e.target.value })} placeholder="unlimited" className={input} /></label>
          )}
          <label className="space-y-1"><span className={label}>Expires in (days)</span><input type="number" min={1} value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} placeholder="never" className={input} /></label>
          <label className="space-y-1 sm:col-span-3"><span className={label}>Note (for you)</span><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={200} placeholder="e.g. Instagram giveaway" className={input} /></label>
          <div className="flex items-end sm:col-span-4">
            <Button className="w-full justify-center sm:w-auto" disabled={busy || !Number(form.credits) || (kind === "individual" && !form.email.includes("@")) || (form.code.length > 0 && form.code.length < 3)} onClick={() => void create()}>
              Create {kind === "group" ? "group" : "individual"} code
            </Button>
          </div>
        </div>
        {msg && <p className={cx("mt-3 break-all text-sm", msg.ok ? "text-success" : "text-destructive")}>{msg.text}</p>}
      </Panel>
      {!data ? <Loading error={error} onRetry={() => void reload()} /> : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Group codes" value={codes.filter((c) => c.kind === "group").length} />
            <Kpi label="Individual codes" value={codes.filter((c) => c.kind === "individual").length} />
            <Kpi label="Redemptions" value={codes.reduce((n, c) => n + c.uses, 0)} tone={codes.some((c) => c.uses) ? "good" : undefined} />
            <Kpi label="Active now" value={codes.filter((c) => c.status === "Active").length} />
          </div>
          {codes.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-text">No codes yet. Create one above or ask the assistant.</p>
          ) : (
            <ul className="space-y-2">
              {codes.map((c) => (
                <li key={c.code} className="rounded-xl border border-border bg-surface p-3 sm:p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="font-mono text-sm font-bold tracking-wider">{c.code}</span>
                    <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_TONE[c.status] ?? STATUS_TONE.Off)}>{c.status}</span>
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-muted-text">{c.kind === "group" ? "Group" : `For ${c.forEmail}`}</span>
                    <span className="ml-auto text-sm font-semibold tabular-nums text-success">+{c.credits}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-text">
                    <span>Used {c.uses}{c.maxUses ? ` of ${c.maxUses}` : ""}</span>
                    <span>{c.expiresAt ? `Expires ${when(c.expiresAt)}` : "Never expires"}</span>
                    {c.note && <span className="truncate">{c.note}</span>}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {c.redemptions.length > 0 && (
                      <button type="button" onClick={() => setOpen(open === c.code ? null : c.code)} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-white/5">
                        {open === c.code ? "Hide" : "Who redeemed"} ({c.redemptions.length})
                      </button>
                    )}
                    <button type="button" onClick={() => void toggle(c)} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-white/5">{c.active ? "Turn off" : "Turn on"}</button>
                    <button type="button" onClick={() => void remove(c)} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-rose-500/30 px-2.5 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/10">
                      <Trash2 className="size-3.5" aria-hidden="true" /> Delete
                    </button>
                  </div>
                  {open === c.code && (
                    <ul className="mt-3 space-y-1 border-t border-border pt-3 text-xs">
                      {c.redemptions.map((r) => (
                        <li key={r.email + r.at} className="flex justify-between gap-3"><span className="truncate">{r.email}</span><span className="shrink-0 text-muted-text">Redeemed {when(r.at)}</span></li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
