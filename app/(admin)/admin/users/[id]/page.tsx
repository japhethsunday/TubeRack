"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Ban, CheckCircle2, Eye, LogOut, MailCheck, Trash2 } from "lucide-react";
import { api } from "@/src/lib/api";
import { Badge } from "@/src/components/ui/Badge";
import { Button } from "@/src/components/ui/Button";
import { CreditEditor, deleteAccount, Kpi, Loading, PageTitle, Panel, errorText, th, td, useAdmin, when } from "@/src/components/admin/kit";

interface Detail {
  user: { id: string; email: string; name: string; status: string; verified: boolean; createdAt: string; admin: boolean };
  workspaces: { id: string; name: string; role: string; balance: number; monthlyGrant: number; unlimited: boolean; refilledAt: string | null; projects: number; assets: number; youtube: string | null }[];
  sessions: { createdAt: string; lastUsedAt: string; device: string }[];
  usage: { kind: string; status: string; provider: string; createdAt: string }[];
  ledger: { kind: string; amount: number; balanceAfter: number; ref: string; createdAt: string }[];
  projects: { id: string; name: string; status: string; updatedAt: string }[];
}

export default function AdminUser() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, reload } = useAdmin<Detail>(`/api/v1/admin/users/${id}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function act(action: "suspend" | "reactivate" | "sign-out" | "verify-email", label: string) {
    if (!window.confirm(`${label} ${data?.user.email}?`)) return;
    setBusy(action);
    setMsg(null);
    try {
      await api.post(`/api/v1/admin/users/${id}`, { action });
      await reload();
      setMsg(`${label}: done.`);
    } catch (e) {
      setMsg(errorText(e));
    }
    setBusy(null);
  }

  async function remove() {
    if (!data) return;
    setBusy("delete");
    setMsg(null);
    try {
      if (await deleteAccount(data.user.id, data.user.email)) router.push("/admin/users");
    } catch (e) {
      setMsg(errorText(e));
    }
    setBusy(null);
  }

  return (
    <>
      <Link href="/admin/users" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-text hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" /> All users</Link>
      {!data ? <Loading error={error} onRetry={() => void reload()} /> : (
        <div className="space-y-6">
          <PageTitle
            title={data.user.email}
            sub={`${data.user.name || "No name"} · joined ${when(data.user.createdAt)}`}
            actions={<>
              <Link href={`/admin/users/${id}/view`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"><Eye className="size-4" aria-hidden="true" /> View as user</Link>
              {data.user.admin ? <Badge tone="info">Admin</Badge> : (
              <>
                {data.user.status === "active"
                  ? <Button size="sm" variant="outline" loading={busy === "suspend"} onClick={() => void act("suspend", "Suspend")}><Ban className="size-4" aria-hidden="true" /> Suspend</Button>
                  : <Button size="sm" loading={busy === "reactivate"} onClick={() => void act("reactivate", "Reactivate")}><CheckCircle2 className="size-4" aria-hidden="true" /> Reactivate</Button>}
                <Button size="sm" variant="outline" loading={busy === "sign-out"} onClick={() => void act("sign-out", "Sign out everywhere")}><LogOut className="size-4" aria-hidden="true" /> Sign out everywhere</Button>
                {!data.user.verified && <Button size="sm" variant="outline" loading={busy === "verify-email"} onClick={() => void act("verify-email", "Mark verified")}><MailCheck className="size-4" aria-hidden="true" /> Verify email</Button>}
                <Button size="sm" variant="destructive" loading={busy === "delete"} onClick={() => void remove()}><Trash2 className="size-4" aria-hidden="true" /> Delete account</Button>
              </>
            )}
            </>}
          />
          {msg && <p className="text-sm text-muted-text">{msg}</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Status" value={data.user.status} tone={data.user.status === "active" ? "good" : "bad"} />
            <Kpi label="Email" value={data.user.verified ? "Verified" : "Unverified"} />
            <Kpi label="Signed-in devices" value={data.sessions.length} />
            <Kpi label="Recent generations" value={data.usage.length} />
          </div>
          {data.workspaces.map((w) => (
            <Panel key={w.id} title={`Credits · ${w.name} (${w.role})`} right={<span className="text-xs text-muted-text">{w.projects} projects · {w.assets} files{w.youtube ? ` · ${w.youtube}` : ""}</span>}>
              {w.role === "owner" ? <CreditEditor workspaceId={w.id} balance={w.balance} monthlyGrant={w.monthlyGrant} unlimited={w.unlimited} onDone={() => void reload()} /> : <p className="text-sm text-muted-text">Member of this workspace — credits are managed on the owner&apos;s account.</p>}
            </Panel>
          ))}
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Credit history">
              {data.ledger.length === 0 ? <p className="text-sm text-muted-text">No credit activity yet.</p> : (
                <table className="w-full text-sm"><tbody>
                  {data.ledger.map((l, i) => (
                    <tr key={i} className="border-t border-border first:border-0">
                      <td className={`${td} text-xs text-muted-text`}>{when(l.createdAt)}</td>
                      <td className={td}>{l.ref || l.kind}</td>
                      <td className={`${td} text-right tabular-nums ${l.amount < 0 ? "text-destructive" : "text-success"}`}>{l.amount > 0 ? `+${l.amount}` : l.amount}</td>
                      <td className={`${td} text-right tabular-nums text-muted-text`}>{l.balanceAfter}</td>
                    </tr>
                  ))}
                </tbody></table>
              )}
            </Panel>
            <Panel title="Recent generations">
              {data.usage.length === 0 ? <p className="text-sm text-muted-text">None yet.</p> : (
                <table className="w-full text-sm"><tbody>
                  {data.usage.map((u, i) => (
                    <tr key={i} className="border-t border-border first:border-0">
                      <td className={`${td} text-xs text-muted-text`}>{when(u.createdAt)}</td>
                      <td className={`${td} capitalize`}>{u.kind}</td>
                      <td className={td}><Badge tone={u.status === "completed" ? "ok" : "bad"}>{u.status}</Badge></td>
                    </tr>
                  ))}
                </tbody></table>
              )}
            </Panel>
            <Panel title="Projects">
              {data.projects.length === 0 ? <p className="text-sm text-muted-text">No projects.</p> : (
                <ul className="divide-y divide-border text-sm">{data.projects.map((p) => <li key={p.id} className="flex justify-between gap-2 py-1.5"><span className="truncate">{p.name}</span><span className="shrink-0 text-xs text-muted-text">{p.status} · {when(p.updatedAt)}</span></li>)}</ul>
              )}
            </Panel>
            <Panel title="Signed-in devices">
              {data.sessions.length === 0 ? <p className="text-sm text-muted-text">No active sessions.</p> : (
                <table className="w-full text-sm"><thead><tr><th className={th}>Device</th><th className={th}>Last used</th></tr></thead><tbody>
                  {data.sessions.map((s, i) => <tr key={i} className="border-t border-border"><td className={`${td} max-w-xs truncate text-xs`} title={s.device}>{s.device || "Unknown"}</td><td className={`${td} whitespace-nowrap text-xs text-muted-text`}>{when(s.lastUsedAt)}</td></tr>)}
                </tbody></table>
              )}
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
