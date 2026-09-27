"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Ban, CheckCircle2, Database, LogOut, RefreshCw, Search, ShieldCheck, Users, MonitorPlay } from "lucide-react";
import { api, ApiError } from "@/src/lib/api";
import { Badge } from "@/src/components/ui/Badge";
import { Button } from "@/src/components/ui/Button";
import { cx } from "@/src/components/ui/cx";

interface Overview {
  users: { total: number; d1: number; d7: number; d30: number; suspended: number; unverified: number };
  active: { d1: number; d7: number };
  content: { workspaces: number; projects: number; assets: number; storageBytes: number; youtubeConnections: number; publishes: number; trendWatches: number; competitors: number };
  usage: { kind: string; ok: number; failed: number }[];
  daily: { day: string; signups: number; generations: number }[];
  services: { name: string; ok: boolean }[];
}
interface AdminUser { id: string; email: string; name: string; status: string; verified: boolean; createdAt: string; lastSeen: string | null; projects: number; usage30: number; youtube: boolean }
interface AuditRow { id: string; action: string; resource: string; email: string; createdAt: string }

const fmt = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const bytes = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
const TABS = ["Overview", "Users", "Security log"] as const;

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-2xl font-bold tabular-nums">{typeof value === "number" ? fmt.format(value) : value}</div>
      <div className="mt-1 text-xs text-muted-text">{label}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-text">{hint}</div>}
    </div>
  );
}

function Bars({ data }: { data: Overview["daily"] }) {
  const max = Math.max(1, ...data.map((d) => d.signups));
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 text-sm font-semibold">Sign-ups, last 14 days</div>
      <div className="flex h-32 items-end gap-1.5" role="img" aria-label="Daily sign-ups">
        {data.map((d) => (
          <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${d.day}: ${d.signups} sign-ups, ${d.generations} generations`}>
            <span className="text-[10px] tabular-nums text-muted-text">{d.signups || ""}</span>
            <div className="w-full rounded-t bg-primary" style={{ height: `${Math.max(2, (d.signups / max) * 96)}px` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-text">
        <span>{data[0]?.day.slice(5)}</span>
        <span>{data[data.length - 1]?.day.slice(5)}</span>
      </div>
    </div>
  );
}

export function AdminDashboard({ adminEmail }: { adminEmail: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<{ total: number; page: number; pageSize: number; users: AdminUser[] } | null>(null);
  const [auditRows, setAuditRows] = useState<AuditRow[] | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : "Something went wrong. Refresh and try again.");
  const loadOverview = useCallback(() => api.get<Overview>("/api/v1/admin/overview").then(setOverview).catch(fail), []);
  const loadUsers = useCallback((query: string, p: number) => api.get<NonNullable<typeof users>>(`/api/v1/admin/users?${new URLSearchParams({ q: query, page: String(p) })}`).then(setUsers).catch(fail), []);
  const loadAudit = useCallback(() => api.get<AuditRow[]>("/api/v1/admin/audit").then(setAuditRows).catch(fail), []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);
  useEffect(() => {
    if (tab === "Users") void loadUsers(q, page);
    if (tab === "Security log") void loadAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on tab/page change only; search submits explicitly.
  }, [tab, page]);

  async function act(user: AdminUser, action: "suspend" | "reactivate" | "sign-out" | "verify-email") {
    const label = { suspend: "Suspend", reactivate: "Reactivate", "sign-out": "Sign out everywhere", "verify-email": "Mark email verified" }[action];
    if (!window.confirm(`${label}: ${user.email}?`)) return;
    setBusy(`${user.id}:${action}`);
    setError(null);
    try {
      await api.post(`/api/v1/admin/users/${user.id}`, { action });
      await loadUsers(q, page);
    } catch (e) {
      fail(e);
    }
    setBusy(null);
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><ShieldCheck className="size-6 text-primary" aria-hidden="true" /> Admin</h1>
          <p className="text-sm text-muted-text">Signed in as {adminEmail}. Every action here is recorded in the security log.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { void loadOverview(); if (tab === "Users") void loadUsers(q, page); if (tab === "Security log") void loadAudit(); }}>
          <RefreshCw className="size-4" aria-hidden="true" /> Refresh
        </Button>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label="Admin sections">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx("shrink-0 border-b-2 px-4 py-2 text-sm font-medium", tab === t ? "border-primary text-primary" : "border-transparent text-muted-text hover:text-foreground")}>
            {t}
          </button>
        ))}
      </nav>

      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      {tab === "Overview" && (overview ? (
        <div className="space-y-6">
          <section aria-label="Users" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Total users" value={overview.users.total} />
            <Stat label="New today" value={overview.users.d1} />
            <Stat label="New this week" value={overview.users.d7} />
            <Stat label="Active today" value={overview.active.d1} />
            <Stat label="Active this week" value={overview.active.d7} />
            <Stat label="Unverified / suspended" value={`${overview.users.unverified} / ${overview.users.suspended}`} />
          </section>
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <Bars data={overview.daily} />
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Database className="size-4" aria-hidden="true" /> Services</div>
              <ul className="space-y-1.5">
                {overview.services.map((s) => (
                  <li key={s.name} className="flex items-center justify-between text-sm">
                    <span>{s.name}</span>
                    <Badge tone={s.ok ? "ok" : "bad"}>{s.ok ? "Connected" : "Missing"}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <section aria-label="Content" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Workspaces" value={overview.content.workspaces} />
            <Stat label="Projects" value={overview.content.projects} />
            <Stat label="Media files" value={overview.content.assets} hint={bytes(overview.content.storageBytes)} />
            <Stat label="YouTube channels connected" value={overview.content.youtubeConnections} />
            <Stat label="Videos published" value={overview.content.publishes} />
            <Stat label="Niches followed" value={overview.content.trendWatches} />
            <Stat label="Competitors tracked" value={overview.content.competitors} />
          </section>
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Activity className="size-4" aria-hidden="true" /> Generations, last 7 days</div>
            {overview.usage.length === 0 ? <p className="text-sm text-muted-text">No generations yet.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted-text"><th className="py-1 font-medium">Type</th><th className="py-1 text-right font-medium">Succeeded</th><th className="py-1 text-right font-medium">Failed</th><th className="py-1 text-right font-medium">Failure rate</th></tr></thead>
                <tbody>
                  {overview.usage.map((u) => {
                    const rate = u.ok + u.failed ? Math.round((u.failed / (u.ok + u.failed)) * 100) : 0;
                    return (
                      <tr key={u.kind} className="border-t border-border">
                        <td className="py-1.5 capitalize">{u.kind}</td>
                        <td className="py-1.5 text-right tabular-nums">{u.ok}</td>
                        <td className="py-1.5 text-right tabular-nums">{u.failed}</td>
                        <td className={cx("py-1.5 text-right tabular-nums", rate >= 20 && "text-destructive")}>{rate}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : !error && <p className="text-sm text-muted-text">Loading…</p>)}

      {tab === "Users" && (
        <div className="space-y-3">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); void loadUsers(q, 1); }}>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-text" aria-hidden="true" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by email or name" aria-label="Search users" className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm" />
            </div>
            <Button type="submit">Search</Button>
          </form>
          {!users ? <p className="text-sm text-muted-text">Loading…</p> : (
            <>
              <p className="text-xs text-muted-text"><Users className="mr-1 inline size-3.5" aria-hidden="true" />{users.total} account{users.total === 1 ? "" : "s"}</p>
              <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
                {users.users.map((u) => (
                  <li key={u.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold">{u.email}</span>
                        {u.status !== "active" && <Badge tone="bad">{u.status}</Badge>}
                        {!u.verified && <Badge tone="warn">unverified</Badge>}
                        {u.youtube && <Badge tone="info"><MonitorPlay className="mr-1 inline size-3" aria-hidden="true" />YouTube</Badge>}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-text">
                        {u.name || "No name"} · joined {when(u.createdAt)} · last seen {when(u.lastSeen)} · {u.projects} projects · {u.usage30} generations (30d)
                      </div>
                    </div>
                    {u.email.toLowerCase() === adminEmail.toLowerCase() ? <Badge tone="info">You</Badge> : <div className="flex flex-wrap gap-1.5">
                      {u.status === "active" ? (
                        <Button size="sm" variant="outline" loading={busy === `${u.id}:suspend`} onClick={() => void act(u, "suspend")}><Ban className="size-3.5" aria-hidden="true" /> Suspend</Button>
                      ) : (
                        <Button size="sm" variant="outline" loading={busy === `${u.id}:reactivate`} onClick={() => void act(u, "reactivate")}><CheckCircle2 className="size-3.5" aria-hidden="true" /> Reactivate</Button>
                      )}
                      <Button size="sm" variant="ghost" loading={busy === `${u.id}:sign-out`} onClick={() => void act(u, "sign-out")}><LogOut className="size-3.5" aria-hidden="true" /> Sign out</Button>
                      {!u.verified && <Button size="sm" variant="ghost" loading={busy === `${u.id}:verify-email`} onClick={() => void act(u, "verify-email")}>Verify</Button>}
                    </div>}
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between text-sm">
                <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                <span className="text-xs text-muted-text">Page {users.page} of {Math.max(1, Math.ceil(users.total / users.pageSize))}</span>
                <Button size="sm" variant="ghost" disabled={page * users.pageSize >= users.total} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "Security log" && (!auditRows ? <p className="text-sm text-muted-text">Loading…</p> : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="text-left text-xs text-muted-text"><th className="p-2 font-medium">When</th><th className="p-2 font-medium">Who</th><th className="p-2 font-medium">Action</th><th className="p-2 font-medium">Target</th></tr></thead>
            <tbody>
              {auditRows.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="whitespace-nowrap p-2 text-xs text-muted-text">{when(a.createdAt)}</td>
                  <td className="p-2 text-xs">{a.email || "—"}</td>
                  <td className={cx("p-2 font-mono text-xs", a.action.includes("denied") && "text-destructive")}>{a.action}</td>
                  <td className="p-2 text-xs text-muted-text">{a.resource}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
