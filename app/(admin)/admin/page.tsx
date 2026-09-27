"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/src/components/ui/Badge";
import { Button } from "@/src/components/ui/Button";
import { Kpi, Loading, PageTitle, Panel, bytes, th, td, useAdmin } from "@/src/components/admin/kit";

interface Overview {
  users: { total: number; d1: number; d7: number; d30: number; suspended: number; unverified: number };
  active: { d1: number; d7: number };
  content: { workspaces: number; projects: number; assets: number; storageBytes: number; youtubeConnections: number; publishes: number; trendWatches: number; competitors: number };
  usage: { kind: string; ok: number; failed: number }[];
  daily: { day: string; signups: number; generations: number }[];
  services: { name: string; ok: boolean }[];
}

function Chart({ data, field, label }: { data: Overview["daily"]; field: "signups" | "generations"; label: string }) {
  const max = Math.max(1, ...data.map((d) => d[field]));
  return (
    <Panel title={label}>
      <div className="flex h-36 items-end gap-1.5" role="img" aria-label={label}>
        {data.map((d) => (
          <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${d.day}: ${d[field]}`}>
            <span className="text-[10px] tabular-nums text-muted-text">{d[field] || ""}</span>
            <div className="w-full rounded-t bg-primary" style={{ height: `${Math.max(2, (d[field] / max) * 110)}px` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-text"><span>{data[0]?.day.slice(5)}</span><span>{data[data.length - 1]?.day.slice(5)}</span></div>
    </Panel>
  );
}

export default function AdminOverview() {
  const { data, error, loading, reload } = useAdmin<Overview>("/api/v1/admin/overview");
  return (
    <>
      <PageTitle title="Overview" sub="Live numbers from the Recktube database." actions={<Button size="sm" variant="outline" loading={loading} onClick={() => void reload()}><RefreshCw className="size-4" aria-hidden="true" /> Refresh</Button>} />
      {!data ? <Loading error={error} onRetry={() => void reload()} /> : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Total users" value={data.users.total} />
            <Kpi label="New today" value={data.users.d1} tone={data.users.d1 ? "good" : undefined} />
            <Kpi label="New this week" value={data.users.d7} />
            <Kpi label="Active today" value={data.active.d1} />
            <Kpi label="Active this week" value={data.active.d7} />
            <Kpi label="Suspended" value={data.users.suspended} tone={data.users.suspended ? "bad" : undefined} hint={`${data.users.unverified} unverified`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Chart data={data.daily} field="signups" label="Sign-ups · 14 days" />
            <Chart data={data.daily} field="generations" label="Generations · 14 days" />
          </div>
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <Panel title="Generations · last 7 days" right={<Link href="/admin/usage" className="text-xs text-primary hover:underline">Live feed</Link>}>
              {data.usage.length === 0 ? <p className="text-sm text-muted-text">No generations yet.</p> : (
                <table className="w-full text-sm">
                  <thead><tr><th className={th}>Type</th><th className={`${th} text-right`}>Succeeded</th><th className={`${th} text-right`}>Failed</th><th className={`${th} text-right`}>Failure rate</th></tr></thead>
                  <tbody>
                    {data.usage.map((u) => {
                      const rate = u.ok + u.failed ? Math.round((u.failed / (u.ok + u.failed)) * 100) : 0;
                      return (
                        <tr key={u.kind} className="border-t border-border">
                          <td className={`${td} capitalize`}>{u.kind}</td>
                          <td className={`${td} text-right tabular-nums`}>{u.ok}</td>
                          <td className={`${td} text-right tabular-nums`}>{u.failed}</td>
                          <td className={`${td} text-right tabular-nums ${rate >= 20 ? "text-destructive" : ""}`}>{rate}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Panel>
            <Panel title="Services" right={<Link href="/admin/system" className="text-xs text-primary hover:underline">System</Link>}>
              <ul className="space-y-1.5 text-sm">
                {data.services.map((s) => (
                  <li key={s.name} className="flex items-center justify-between gap-2"><span>{s.name}</span><Badge tone={s.ok ? "ok" : "bad"}>{s.ok ? "Connected" : "Missing"}</Badge></li>
                ))}
              </ul>
            </Panel>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Workspaces" value={data.content.workspaces} />
            <Kpi label="Projects" value={data.content.projects} />
            <Kpi label="Media files" value={data.content.assets} hint={bytes(data.content.storageBytes)} />
            <Kpi label="YouTube channels" value={data.content.youtubeConnections} />
            <Kpi label="Videos published" value={data.content.publishes} />
            <Kpi label="Niches followed" value={data.content.trendWatches} />
            <Kpi label="Competitors tracked" value={data.content.competitors} />
          </div>
        </div>
      )}
    </>
  );
}
