"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { api, ApiError } from "@/src/lib/api";
import { Button } from "@/src/components/ui/Button";
import { cx } from "@/src/components/ui/cx";
import { Kpi, Loading, PageTitle, Panel, useAdmin } from "@/src/components/admin/kit";

interface Flag { id: string; kind: string; severity: string; evidence: string; status: string; autoAction: string; email: string | null; userStatus: string | null; createdAt: string }

const KIND: Record<string, string> = {
  account_farm: "Many accounts from one network",
  self_referral: "Invited their own account",
  affiliate_self: "Affiliate credit to own account",
  affiliate_farm: "Suspicious affiliate sign-ups",
  heavy_use: "Unusually heavy use",
  harmful_prompt: "Harmful prompt blocked",
};

export default function AdminSafety() {
  const { data, error, reload } = useAdmin<Flag[]>("/api/v1/admin/safety");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function act(id: string, action: string) {
    setBusy(`${id}:${action}`);
    setMsg(null);
    try {
      const r = await api.patch<{ result: string }>("/api/v1/admin/safety", { id, action });
      if (r.result) setMsg({ ok: true, text: r.result });
      await reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Couldn't do that." });
    }
    setBusy(null);
  }

  async function scan() {
    setBusy("scan");
    setMsg(null);
    try {
      const r = await api.post<Record<string, number>>("/api/v1/admin/safety", {});
      setMsg({ ok: true, text: `Scan finished: ${r.farms ?? 0} account groups, ${r.suspended ?? 0} suspended, ${r.selfReferrals ?? 0} self-referrals, ${(r.affiliateSelf ?? 0) + (r.affiliateFarms ?? 0)} affiliate issues, ${r.heavy ?? 0} heavy users.` });
      await reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "The scan failed." });
    }
    setBusy(null);
  }

  const open = data?.filter((f) => f.status === "open") ?? [];
  const auto = data?.filter((f) => f.autoAction) ?? [];
  return (
    <>
      <PageTitle
        title="Safety"
        sub="Fake accounts, referral and affiliate fraud, and harmful prompts. Only clear-cut cases are handled automatically — everything else waits for you."
        actions={<Button size="sm" variant="outline" loading={busy === "scan"} onClick={() => void scan()}>Run check now</Button>}
      />
      {!data ? <Loading error={error} onRetry={() => void reload()} /> : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Kpi label="Waiting for review" value={open.length} tone={open.length ? "bad" : "good"} />
            <Kpi label="Handled automatically" value={auto.length} />
            <Kpi label="High severity (open)" value={open.filter((f) => f.severity === "high").length} tone={open.some((f) => f.severity === "high") ? "bad" : undefined} />
          </div>
          {msg && <p role="status" className={msg.ok ? "rounded-lg bg-success/10 p-3 text-sm text-success" : "rounded-lg bg-destructive/10 p-3 text-sm text-destructive"}>{msg.text}</p>}
          <Panel title="Flags">
            {data.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-text"><ShieldCheck className="size-4 text-success" aria-hidden="true" /> Nothing suspicious found. The check runs every day.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.map((f) => (
                  <li key={f.id} className={cx("flex flex-col gap-2 py-3 sm:flex-row sm:items-start", f.status !== "open" && "opacity-70")}>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-semibold", f.severity === "high" ? "bg-destructive/15 text-destructive" : f.severity === "medium" ? "bg-warning/15 text-warning" : "bg-muted text-muted-text")}>{f.severity}</span>
                        <span className="font-medium">{KIND[f.kind] ?? f.kind}</span>
                        {f.email && <span className="text-muted-text">{f.email}</span>}
                        {f.userStatus === "suspended" && <span className="text-xs text-destructive">suspended</span>}
                      </div>
                      <p className="text-sm text-muted-text">{f.evidence}</p>
                      {f.autoAction && <p className="text-xs text-primary">Done automatically: {f.autoAction}</p>}
                      <p className="text-[11px] text-muted-text">{new Date(f.createdAt).toLocaleString()} · {f.status}</p>
                    </div>
                    {f.email && (
                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        {f.userStatus === "suspended" ? (
                          <Button size="sm" variant="outline" loading={busy === `${f.id}:reactivate`} onClick={() => void act(f.id, "reactivate")}>Reactivate</Button>
                        ) : (
                          <Button size="sm" loading={busy === `${f.id}:suspend`} onClick={() => void act(f.id, "suspend")}>Suspend</Button>
                        )}
                        {f.status === "open" && <Button size="sm" variant="ghost" onClick={() => void act(f.id, "dismiss")}>Dismiss</Button>}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
