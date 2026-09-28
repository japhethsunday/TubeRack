"use client";

import Link from "next/link";
import { useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { Badge } from "@/src/components/ui/Badge";
import { Button } from "@/src/components/ui/Button";
import { deleteAccount, errorText, Loading, PageTitle, th, td, useAdmin, when } from "@/src/components/admin/kit";

interface Row { id: string; email: string; name: string; status: string; verified: boolean; createdAt: string; lastSeen: string | null; projects: number; usage30: number; youtube: boolean; credits: number | null; unlimited: boolean }

export default function AdminUsers() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, reload } = useAdmin<{ total: number; page: number; pageSize: number; users: Row[] }>(`/api/v1/admin/users?${new URLSearchParams({ q: query, page: String(page) })}`);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function remove(u: Row) {
    setDeleting(u.id);
    setMsg(null);
    try {
      if (await deleteAccount(u.id, u.email)) {
        setMsg({ ok: true, text: `${u.email} was deleted.` });
        await reload();
      }
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
    setDeleting(null);
  }

  return (
    <>
      <PageTitle title="Users" sub="Every account. Open one to manage credits, sessions and status." />
      {msg && <p role="status" className={`mb-3 text-sm ${msg.ok ? "text-success" : "text-destructive"}`}>{msg.text}</p>}
      <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(q.trim()); }}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-text" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email or name" aria-label="Search users" className="h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm" />
        </div>
        <Button type="submit">Search</Button>
      </form>
      {!data ? <Loading error={error} onRetry={() => void reload()} /> : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr><th className={th}>User</th><th className={th}>Status</th><th className={`${th} text-right`}>Credits</th><th className={`${th} text-right`}>Projects</th><th className={`${th} text-right`}>Gens (30d)</th><th className={th}>Joined</th><th className={th}>Last seen</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id} className="border-t border-border hover:bg-muted/40">
                    <td className={td}>
                      <Link href={`/admin/users/${u.id}`} className="font-semibold text-foreground hover:text-primary hover:underline">{u.email}</Link>
                      <div className="text-xs text-muted-text">{u.name || "—"}{u.youtube ? " · YouTube connected" : ""}</div>
                    </td>
                    <td className={td}>
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={u.status === "active" ? "ok" : "bad"}>{u.status}</Badge>
                        {!u.verified && <Badge tone="warn">unverified</Badge>}
                      </div>
                    </td>
                    <td className={`${td} text-right tabular-nums ${u.credits === 0 && !u.unlimited ? "text-destructive" : ""}`}>{u.unlimited ? "∞" : u.credits ?? "—"}</td>
                    <td className={`${td} text-right tabular-nums`}>{u.projects}</td>
                    <td className={`${td} text-right tabular-nums`}>{u.usage30}</td>
                    <td className={`${td} whitespace-nowrap text-xs text-muted-text`}>{when(u.createdAt)}</td>
                    <td className={`${td} whitespace-nowrap text-xs text-muted-text`}>{when(u.lastSeen)}</td>
                    <td className={`${td} text-right`}>
                      <button
                        type="button"
                        onClick={() => void remove(u)}
                        disabled={deleting === u.id}
                        aria-label={`Delete ${u.email}`}
                        title="Delete account"
                        className="rounded-md p-1.5 text-muted-text hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm">
            <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <span className="text-xs text-muted-text">{data.total} accounts · page {data.page} of {Math.max(1, Math.ceil(data.total / data.pageSize))}</span>
            <Button size="sm" variant="ghost" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </>
      )}
    </>
  );
}
