"use client";

import Link from "next/link";
import { Kpi, Loading, PageTitle, Panel, th, td, useAdmin } from "@/src/components/admin/kit";

interface Growth {
  totals: { users: number; new30: number; new7: number; optedIn: number; verified: number };
  sources: { source: string; campaign: string; count: number }[];
  daily: { day: string; count: number }[];
  referrals: { total: number; rewarded: number; creditsGiven: number };
  topReferrers: { id: string; email: string; name: string; invited: number; joined: number }[];
  lifecycle: { kind: string; count: number }[];
}

const LIFECYCLE: Record<string, string> = { "getting-started": "Getting started (day 3)", comeback: "Come back (14 days quiet)", refill: "Credits refilled" };

export default function AdminGrowth() {
  const { data, error, reload } = useAdmin<Growth>("/api/v1/admin/growth");
  const max = Math.max(1, ...(data?.daily.map((d) => d.count) ?? [1]));
  return (
    <>
      <PageTitle title="Growth" sub="Where new creators come from, how invites perform, and who's opted in to product email." />
      {!data ? <Loading error={error} onRetry={() => void reload()} /> : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kpi label="Accounts" value={data.totals.users} />
            <Kpi label="New (7 days)" value={data.totals.new7} tone="good" />
            <Kpi label="New (30 days)" value={data.totals.new30} />
            <Kpi label="Verified" value={data.totals.verified} hint={`${data.totals.users ? Math.round((data.totals.verified / data.totals.users) * 100) : 0}%`} />
            <Kpi label="Opted in to email" value={data.totals.optedIn} hint={`${data.totals.users ? Math.round((data.totals.optedIn / data.totals.users) * 100) : 0}% can receive campaigns`} />
          </div>

          <Panel title="Sign-ups, last 30 days">
            {data.daily.length === 0 ? <p className="text-sm text-muted-text">No sign-ups yet.</p> : (
              <div className="flex h-40 items-end gap-1" role="img" aria-label="Daily sign-ups">
                {data.daily.map((d) => (
                  <div key={d.day} className="group relative flex-1">
                    <div className="rounded-t bg-gradient-to-t from-violet-600 to-fuchsia-500" style={{ height: `${Math.max(4, (d.count / max) * 150)}px` }} />
                    <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-elevated px-1.5 py-0.5 text-[10px] shadow group-hover:block">{d.day}: {d.count}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="Where sign-ups come from (90 days)">
              {data.sources.length === 0 ? <p className="text-sm text-muted-text">No data yet. Links with ?utm_source=… or invite links are tracked automatically.</p> : (
                <table className="w-full text-sm">
                  <thead><tr><th className={th}>Source</th><th className={th}>Campaign</th><th className={`${th} text-right`}>Sign-ups</th></tr></thead>
                  <tbody>{data.sources.map((s, i) => <tr key={i} className="border-t border-border"><td className={`${td} font-medium`}>{s.source}</td><td className={`${td} text-muted-text`}>{s.campaign}</td><td className={`${td} text-right tabular-nums`}>{s.count}</td></tr>)}</tbody>
                </table>
              )}
              <p className="mt-3 text-[11px] text-muted-text">Tag links you share, e.g. recktube.xyz/?utm_source=tiktok&amp;utm_campaign=promo1 — the sign-up is credited to that post.</p>
            </Panel>

            <Panel title="Invites">
              <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-muted p-2"><div className="text-lg font-bold tabular-nums">{data.referrals.total}</div><div className="text-[11px] text-muted-text">Invited sign-ups</div></div>
                <div className="rounded-lg bg-muted p-2"><div className="text-lg font-bold tabular-nums">{data.referrals.rewarded}</div><div className="text-[11px] text-muted-text">Verified & rewarded</div></div>
                <div className="rounded-lg bg-muted p-2"><div className="text-lg font-bold tabular-nums">{data.referrals.creditsGiven}</div><div className="text-[11px] text-muted-text">Credits given</div></div>
              </div>
              {data.topReferrers.length === 0 ? <p className="text-sm text-muted-text">No invites yet. Every user has an invite link under their profile menu → Invite friends.</p> : (
                <table className="w-full text-sm">
                  <thead><tr><th className={th}>Top inviters</th><th className={`${th} text-right`}>Invited</th><th className={`${th} text-right`}>Joined</th></tr></thead>
                  <tbody>{data.topReferrers.map((r) => <tr key={r.id} className="border-t border-border"><td className={td}><Link href={`/admin/users/${r.id}`} className="hover:text-primary hover:underline">{r.name || r.email}</Link></td><td className={`${td} text-right tabular-nums`}>{r.invited}</td><td className={`${td} text-right tabular-nums`}>{r.joined}</td></tr>)}</tbody>
                </table>
              )}
            </Panel>
          </div>

          <Panel title="Automatic emails (30 days)">
            {data.lifecycle.length === 0 ? <p className="text-sm text-muted-text">None sent yet. They go out with the daily run to people who opted in.</p> : (
              <ul className="grid gap-2 sm:grid-cols-3">
                {data.lifecycle.map((l) => <li key={l.kind} className="rounded-lg bg-muted p-3 text-sm"><div className="text-lg font-bold tabular-nums">{l.count}</div><div className="text-xs text-muted-text">{LIFECYCLE[l.kind] ?? l.kind}</div></li>)}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
