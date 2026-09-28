"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/src/lib/api";
import { Button } from "@/src/components/ui/Button";
import { cx } from "@/src/components/ui/cx";
import { Sparkles } from "lucide-react";

export const fmt = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
export const bytes = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);
export const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
export const errorText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Try again.");

/** Load admin data from the backend with loading / error / reload. */
export function useAdmin<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api.get<T>(path));
    } catch (e) {
      setError(errorText(e));
    }
    setLoading(false);
  }, [path]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load from the backend when the path changes.
    void reload();
  }, [reload]);
  return { data, error, loading, reload };
}

export function PageTitle({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted-text">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, children, className, right }: { title?: string; children: React.ReactNode; className?: string; right?: React.ReactNode }) {
  return (
    <section className={cx("rounded-xl border border-border bg-surface", className)}>
      {title && (
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {right}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Kpi({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs font-medium text-muted-text">{label}</div>
      <div className={cx("mt-1 text-2xl font-bold tabular-nums", tone === "good" && "text-success", tone === "bad" && "text-destructive")}>{typeof value === "number" ? fmt.format(value) : value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-text">{hint}</div>}
    </div>
  );
}

export function Loading({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  if (error)
    return (
      <div role="alert" className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {error}
        {onRetry && <Button size="sm" variant="ghost" onClick={onRetry}>Retry</Button>}
      </div>
    );
  return <p className="text-sm text-muted-text">Loading…</p>;
}

/**
 * AI writing box: an optional brief plus a button that drafts the email.
 * The draft lands in the editable fields; nothing is sent automatically.
 */
export function AiWriter({
  title,
  hint,
  placeholder,
  requireBrief = false,
  hasDraft,
  onWrite,
}: {
  title: string;
  hint: string;
  placeholder: string;
  requireBrief?: boolean;
  hasDraft: boolean;
  onWrite: (brief: string) => Promise<void>;
}) {
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setErr(null);
    try {
      await onWrite(brief.trim());
    } catch (e) {
      setErr(errorText(e));
    }
    setBusy(false);
  }
  return (
    <div className="rounded-xl bg-gradient-to-r from-fuchsia-500/60 via-violet-500/60 to-sky-500/60 p-px">
      <div className="space-y-2 rounded-[11px] bg-surface p-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-primary" aria-hidden="true" /> {title}
        </div>
        <p className="text-xs text-muted-text">{hint}</p>
        <textarea
          rows={2}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          maxLength={1200}
          placeholder={placeholder}
          className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm"
        />
        <Button size="sm" loading={busy} disabled={requireBrief && brief.trim().length < 3} onClick={() => void run()} className="bg-gradient-to-r from-fuchsia-600 via-violet-600 to-sky-600 text-white">
          <Sparkles className="size-4" aria-hidden="true" /> {busy ? "Writing…" : hasDraft ? "Rewrite" : "Write with AI"}
        </Button>
        {err && <p role="alert" className="text-xs text-destructive">{err}</p>}
      </div>
    </div>
  );
}

/**
 * Permanently delete an account after the admin types its email to confirm.
 * Returns false if cancelled; throws with the server's reason on failure.
 */
export async function deleteAccount(id: string, email: string): Promise<boolean> {
  const typed = window.prompt(`Permanently delete ${email}?\n\nThis removes the account, its own workspaces, projects, files and credits. It can't be undone.\n\nType the email address to confirm:`);
  if (typed === null) return false;
  if (typed.trim().toLowerCase() !== email.toLowerCase()) {
    window.alert("The email didn't match — nothing was deleted.");
    return false;
  }
  await api.remove(`/api/v1/admin/users/${id}`);
  return true;
}

export const th ="px-3 py-2 text-left text-xs font-medium text-muted-text";
export const td = "px-3 py-2 align-top";

/** Add/remove credits and change the monthly limit for one workspace. */
export function CreditEditor({ workspaceId, balance, monthlyGrant, unlimited, onDone }: { workspaceId: string; balance: number; monthlyGrant: number; unlimited: boolean; onDone: () => void }) {
  const [amount, setAmount] = useState("100");
  const [reason, setReason] = useState("");
  const [grant, setGrant] = useState(String(monthlyGrant));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(kind: string, body: Record<string, unknown>) {
    setBusy(kind);
    setMsg(null);
    try {
      const res = await api.post<{ emailed?: number }>("/api/v1/admin/credits", { workspaceId, ...body });
      const emailed = res?.emailed ?? 0;
      const gift = (typeof body.delta === "number" && body.delta > 0) || body.unlimited === true;
      setMsg({ ok: true, text: gift ? (emailed ? "Saved. The user has been emailed about it." : "Saved. No email sent (the owner's email isn't verified).") : "Saved." });
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
    setBusy(null);
  }
  const n = Math.max(0, Math.floor(Number(amount) || 0));

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-2xl font-bold tabular-nums">{unlimited ? "∞" : balance.toLocaleString()}</span>
        <span className="text-muted-text">credits · refills to {monthlyGrant.toLocaleString()} every 30 days{unlimited ? " · unlimited" : ""}</span>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1">
          <span className="block text-xs text-muted-text">Amount</span>
          <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9 w-28 rounded-lg border border-border bg-background px-2" />
        </label>
        <label className="min-w-40 flex-1 space-y-1">
          <span className="block text-xs text-muted-text">Reason (shown in the ledger)</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="e.g. Bonus for beta feedback" className="h-9 w-full rounded-lg border border-border bg-background px-2" />
        </label>
        <Button size="sm" disabled={!n} loading={busy === "add"} onClick={() => void send("add", { delta: n, reason })}>Add {n || ""}</Button>
        <Button size="sm" variant="outline" disabled={!n} loading={busy === "remove"} onClick={() => window.confirm(`Remove ${n} credits?`) && void send("remove", { delta: -n, reason })}>Remove</Button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1">
          <span className="block text-xs text-muted-text">Monthly limit</span>
          <input type="number" min={0} value={grant} onChange={(e) => setGrant(e.target.value)} className="h-9 w-28 rounded-lg border border-border bg-background px-2" />
        </label>
        <Button size="sm" variant="outline" loading={busy === "grant"} onClick={() => void send("grant", { monthlyGrant: Math.max(0, Math.floor(Number(grant) || 0)) })}>Save limit</Button>
        <Button size="sm" variant="ghost" loading={busy === "unlimited"} onClick={() => void send("unlimited", { unlimited: !unlimited })}>{unlimited ? "Remove unlimited" : "Make unlimited"}</Button>
      </div>
      {msg && <p className={cx("text-xs", msg.ok ? "text-success" : "text-destructive")}>{msg.text}</p>}
    </div>
  );
}
