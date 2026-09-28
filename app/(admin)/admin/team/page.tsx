"use client";

import { useState } from "react";
import { api } from "@/src/lib/api";
import { Button } from "@/src/components/ui/Button";
import { ROLE_LABELS } from "@/src/lib/admin-roles";
import { errorText, Loading, PageTitle, Panel, useAdmin, when } from "@/src/components/admin/kit";

interface Data { owners: string[]; members: { email: string; role: keyof typeof ROLE_LABELS; name: string; createdAt: string }[] }

export default function AdminTeam() {
  const { data, error, reload } = useAdmin<Data>("/api/v1/admin/team");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<keyof typeof ROLE_LABELS>("support");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function add() {
    setMsg(null);
    try {
      await api.post("/api/v1/admin/team", { email, role });
      setEmail("");
      setMsg({ ok: true, text: "Added. They can open /admin once they sign in with that (verified) email." });
      void reload();
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  }
  async function remove(e: string) {
    if (!window.confirm(`Remove ${e} from the admin team?`)) return;
    await api.remove(`/api/v1/admin/team?email=${encodeURIComponent(e)}`).catch(() => {});
    void reload();
  }

  return (
    <>
      <PageTitle title="Admin team" sub="Give helpers access to only the parts they need. Only owners can add or remove people." />
      <Panel title="Add a teammate" className="mb-4">
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label className="min-w-56 flex-1 space-y-1"><span className="block text-xs text-muted-text">Their Recktube email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-2" /></label>
          <label className="space-y-1"><span className="block text-xs text-muted-text">Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value as keyof typeof ROLE_LABELS)} className="h-10 rounded-lg border border-border bg-background px-2">
              {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          <Button onClick={() => void add()} disabled={!email.includes("@")}>Add</Button>
        </div>
        <p className="mt-2 text-xs text-muted-text">{ROLE_LABELS[role].label} can see: {ROLE_LABELS[role].blurb}.</p>
        {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-success" : "text-destructive"}`}>{msg.text}</p>}
      </Panel>
      {!data ? <Loading error={error} onRetry={() => void reload()} /> : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface text-sm">
          {data.owners.map((o) => (
            <li key={o} className="flex items-center gap-3 px-4 py-3"><span className="min-w-0 flex-1 truncate">{o}</span><span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">Owner</span></li>
          ))}
          {data.members.map((m) => (
            <li key={m.email} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1"><span className="block truncate">{m.email}</span><span className="text-xs text-muted-text">{m.name || "No account yet"} · added {when(m.createdAt)}</span></span>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold">{ROLE_LABELS[m.role]?.label ?? m.role}</span>
              <Button size="sm" variant="ghost" onClick={() => void remove(m.email)}>Remove</Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
