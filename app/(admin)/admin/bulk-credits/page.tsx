"use client";

import { useState } from "react";
import { api } from "@/src/lib/api";
import { Button } from "@/src/components/ui/Button";
import { errorText, PageTitle, Panel } from "@/src/components/admin/kit";

const AUDIENCES = [
  ["all", "Everyone (active, verified)"],
  ["new7", "Joined in the last 7 days"],
  ["new30", "Joined in the last 30 days"],
  ["empty", "Out of credits (balance 0)"],
  ["inactive30", "Not active for 30+ days"],
  ["emails", "Specific email addresses"],
] as const;

export default function AdminBulkCredits() {
  const [audience, setAudience] = useState<string>("new7");
  const [emails, setEmails] = useState("");
  const [amount, setAmount] = useState("100");
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [preview, setPreview] = useState<{ matched: number; sample: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const list = emails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
  const body = { audience, emails: audience === "emails" ? list : undefined, amount: Math.floor(Number(amount) || 0), reason, notify };

  async function check() {
    setMsg(null);
    try {
      setPreview(await api.post("/api/v1/admin/bulk-credits", { ...body, preview: true }));
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  }
  async function give() {
    if (!preview || !window.confirm(`Give ${body.amount} credits to ${preview.matched} account${preview.matched === 1 ? "" : "s"}?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.post<{ matched: number; granted: number; emailed: number }>("/api/v1/admin/bulk-credits", body);
      setMsg({ ok: true, text: `Done: ${r.granted} of ${r.matched} accounts got ${body.amount} credits${notify ? `, ${r.emailed} emailed` : ""}.` });
      setPreview(null);
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
    setBusy(false);
  }

  return (
    <>
      <PageTitle title="Bulk credits" sub="Give credits to a whole group at once — promotions, thank-yous, or making up for an outage." />
      <Panel>
        <div className="space-y-4 text-sm">
          <label className="block space-y-1">
            <span className="text-xs text-muted-text">Who gets them</span>
            <select value={audience} onChange={(e) => { setAudience(e.target.value); setPreview(null); }} className="h-10 w-full rounded-lg border border-border bg-background px-2">
              {AUDIENCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          {audience === "emails" && (
            <label className="block space-y-1">
              <span className="text-xs text-muted-text">Email addresses (comma or new line separated, up to 500)</span>
              <textarea value={emails} onChange={(e) => { setEmails(e.target.value); setPreview(null); }} rows={4} className="w-full rounded-lg border border-border bg-background p-2" />
            </label>
          )}
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <label className="space-y-1">
              <span className="block text-xs text-muted-text">Credits each</span>
              <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-2" />
            </label>
            <label className="space-y-1">
              <span className="block text-xs text-muted-text">Reason (shown in their email and credit history)</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="e.g. Thanks for being an early creator" className="h-10 w-full rounded-lg border border-border bg-background px-2" />
            </label>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-4" />
            Email each person about their credits
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void check()}>Check who gets them</Button>
            <Button disabled={!preview?.matched || !body.amount} loading={busy} onClick={() => void give()}>Give credits</Button>
          </div>
          {preview && (
            <p className="rounded-lg bg-muted/60 p-3">
              <strong>{preview.matched}</strong> account{preview.matched === 1 ? "" : "s"} match{preview.sample.length ? `, e.g. ${preview.sample.join(", ")}` : ""}.
            </p>
          )}
          {msg && <p className={msg.ok ? "text-success" : "text-destructive"}>{msg.text}</p>}
        </div>
      </Panel>
    </>
  );
}
