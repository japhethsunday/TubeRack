"use client";

import { useEffect, useState } from "react";
import { BadgeDollarSign, Check, Copy, Loader2, MousePointerClick, UserPlus, Wallet } from "lucide-react";
import { api, ApiError } from "@/src/lib/api";
import { Button } from "@/src/components/ui/Button";
import { cx } from "@/src/components/ui/cx";

interface Summary {
  status: "none" | "pending" | "approved" | "rejected" | "paused";
  code?: string;
  link?: string;
  commissionPct?: number;
  clicks?: number;
  signups?: number;
  customers?: number;
  earnings?: { pending: number; approved: number; paid: number; currency: string };
  recent?: { when: string; sale: number; commission: number; status: string }[];
  website?: string;
  audience?: string;
  payoutDetails?: string;
}

const money = (n: number, c = "USD") => new Intl.NumberFormat(undefined, { style: "currency", currency: c }).format(n);

/** Affiliate program: apply, then a tracked link with clicks, sign-ups and cash commissions. */
export function AffiliatePanel() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ website: "", audience: "", payoutDetails: "", code: "" });
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get<Summary>("/api/v1/users/me/affiliate").then(setData).catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load the affiliate program."));
  }, []);

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      setData(await api.post<Summary>("/api/v1/users/me/affiliate", { ...form, code: form.code || undefined }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't send your application.");
    }
    setBusy(false);
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <BadgeDollarSign className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold">Affiliate program — earn money</h2>
          <p className="mt-0.5 text-sm text-muted-text">
            Have an audience? Earn a {data?.commissionPct ?? 30}% commission in cash on every payment from creators you bring to Recktube.
          </p>
        </div>
      </div>

      {error && <p role="alert" className="mt-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {!data && !error && <Loader2 className="mt-4 size-5 animate-spin text-muted-text" aria-label="Loading" />}

      {data && (data.status === "none" || data.status === "rejected") && (
        <div className="mt-4 space-y-3">
          {data.status === "rejected" && <p className="rounded-lg bg-muted p-3 text-sm">Your last application wasn&apos;t approved. You can update it and apply again.</p>}
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Your channel, website or social profile</span>
            <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://youtube.com/@yourchannel" className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Your audience</span>
            <textarea value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} rows={3} placeholder="Who follows you, roughly how many, and how you'd share Recktube" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Link name (optional)</span>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} placeholder="yourname" maxLength={24} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" />
              <span className="block text-xs text-muted-text">recktube.xyz/go/{form.code || "yourname"}</span>
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">How we pay you (optional)</span>
              <input value={form.payoutDetails} onChange={(e) => setForm({ ...form, payoutDetails: e.target.value })} placeholder="PayPal email, or bank details" className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            </label>
          </div>
          <Button className="h-11 w-full sm:w-auto" loading={busy} onClick={() => void apply()}>Apply to become an affiliate</Button>
        </div>
      )}

      {data?.status === "pending" && (
        <p className="mt-4 rounded-lg bg-warning/10 p-3 text-sm">
          Thanks for applying! The team reviews applications within a few days. Your link will be <strong>recktube.xyz/go/{data.code}</strong>.
        </p>
      )}

      {data && (data.status === "approved" || data.status === "paused") && data.link && (
        <div className="mt-4 space-y-4">
          {data.status === "paused" && <p className="rounded-lg bg-warning/10 p-3 text-sm">Your affiliate link is paused. Contact support@recktube.xyz.</p>}
          <div className="flex flex-col gap-2 sm:flex-row">
            <input readOnly value={data.link} onFocus={(e) => e.currentTarget.select()} aria-label="Affiliate link" className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 font-mono text-sm" />
            <Button
              className="h-11"
              onClick={() => {
                void navigator.clipboard.writeText(data.link!);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1800);
              }}
            >
              {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />} {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: MousePointerClick, label: "Clicks", value: String(data.clicks ?? 0) },
              { icon: UserPlus, label: "Sign-ups", value: String(data.signups ?? 0) },
              { icon: BadgeDollarSign, label: "Paying customers", value: String(data.customers ?? 0) },
              { icon: Wallet, label: "Paid to you", value: money(data.earnings?.paid ?? 0, data.earnings?.currency) },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-border p-3">
                <k.icon className="size-4 text-primary" aria-hidden="true" />
                <div className="mt-1 text-lg font-bold tabular-nums">{k.value}</div>
                <div className="text-xs text-muted-text">{k.label}</div>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-text">
            Waiting to be paid: <strong className="text-foreground">{money((data.earnings?.pending ?? 0) + (data.earnings?.approved ?? 0), data.earnings?.currency)}</strong> · Commission {data.commissionPct}% · Sign-ups count for 60 days after a click.
          </p>
          {!!data.recent?.length && (
            <ul className="divide-y divide-border rounded-xl border border-border text-sm">
              {data.recent.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-muted-text">{new Date(r.when).toLocaleDateString()}</span>
                  <span className="tabular-nums">{money(r.commission, data.earnings?.currency)}</span>
                  <span className={cx("rounded-full px-2 py-0.5 text-xs", r.status === "paid" ? "bg-success/15 text-success" : r.status === "void" ? "bg-muted text-muted-text" : "bg-warning/15 text-warning")}>{r.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
