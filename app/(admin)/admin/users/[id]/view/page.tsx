"use client";

import Link from "next/link";
import { use } from "react";
import { Eye } from "lucide-react";
import { Kpi, Loading, PageTitle, Panel, useAdmin } from "@/src/components/admin/kit";

interface Snap {
  account: { name: string; email: string; emailVerified: boolean; status: string; joined: string; activeSessions: number };
  credits: { balance: number | "unlimited"; monthlyAllowance: number; lastRefill: string | null; nextRefill: string | null } | null;
  creditHistory: { when: string; change: number; balanceAfter: number; reason: string }[];
  recentGenerations: { when: string; kind: string; status: string }[];
  failedGenerationsLast7Days: number;
  recentJobs: { when: string; type: string; status: string; error: string | null }[];
  projects: { name: string; status: string; stage: string; updated: string }[];
  projectCount: number;
  youtube: { connected: boolean; channel: string | null };
  lastExports: { when: string; status: string; health: string }[];
  recentPublishes: { when: string; status: string; title: string; error: string | null }[];
}

function List<T>({ items, empty, row }: { items: T[]; empty: string; row: (t: T) => React.ReactNode }) {
  return items.length ? <ul className="divide-y divide-border text-sm">{items.map((t, i) => <li key={i} className="py-2">{row(t)}</li>)}</ul> : <p className="text-sm text-muted-text">{empty}</p>;
}

export default function AdminViewAsUser({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: s, error, reload } = useAdmin<Snap>(`/api/v1/admin/users/${id}/view`);
  return (
    <>
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
        <Eye className="size-4 shrink-0" aria-hidden="true" /> Read-only view of this person&apos;s account. Nothing here can change their data, and this view is logged.
      </div>
      {!s ? <Loading error={error} onRetry={() => void reload()} /> : (
        <>
          <PageTitle title={s.account.name || s.account.email} sub={`${s.account.email} · ${s.account.status} · ${s.account.emailVerified ? "verified" : "not verified"} · joined ${s.account.joined}`} actions={<Link href={`/admin/users/${id}`} className="text-sm font-medium text-primary">Manage account →</Link>} />
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Credits" value={s.credits ? (s.credits.balance === "unlimited" ? "Unlimited" : s.credits.balance) : "—"} hint={s.credits?.nextRefill ? `Refills ${s.credits.nextRefill}` : undefined} />
            <Kpi label="Projects" value={s.projectCount} />
            <Kpi label="Failed (7 days)" value={s.failedGenerationsLast7Days} tone={s.failedGenerationsLast7Days ? "bad" : undefined} />
            <Kpi label="YouTube" value={s.youtube.connected ? "Connected" : "Not connected"} hint={s.youtube.channel ?? undefined} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Projects"><List items={s.projects} empty="No projects." row={(p) => <><span className="font-medium">{p.name}</span><span className="block text-xs text-muted-text">{p.stage} · {p.status} · {p.updated}</span></>} /></Panel>
            <Panel title="Recent generations"><List items={s.recentGenerations} empty="Nothing generated yet." row={(g) => <span className="flex justify-between gap-2"><span className="capitalize">{g.kind}</span><span className={g.status === "failed" ? "text-destructive" : "text-muted-text"}>{g.status} · {g.when}</span></span>} /></Panel>
            <Panel title="Credit history"><List items={s.creditHistory} empty="No credit changes." row={(c) => <span className="flex justify-between gap-2"><span className="min-w-0 truncate">{c.reason}</span><span className={c.change >= 0 ? "text-success" : "text-muted-text"}>{c.change > 0 ? "+" : ""}{c.change} → {c.balanceAfter}</span></span>} /></Panel>
            <Panel title="Jobs, exports and publishes">
              <List
                items={[...s.recentJobs.map((j) => ({ a: j.type, b: j.status, c: j.error ?? "", w: j.when })), ...s.lastExports.map((e) => ({ a: "export", b: e.status, c: e.health, w: e.when })), ...s.recentPublishes.map((p) => ({ a: `publish: ${p.title}`, b: p.status, c: p.error ?? "", w: p.when }))]}
                empty="No jobs, exports or publishes."
                row={(x) => <><span className="flex justify-between gap-2"><span className="min-w-0 truncate capitalize">{x.a}</span><span className="text-muted-text">{x.b} · {x.w}</span></span>{x.c && <span className="block text-xs text-destructive">{x.c}</span>}</>}
              />
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
