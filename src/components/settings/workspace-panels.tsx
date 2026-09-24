"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, Trash2, Users, Activity } from "lucide-react";
import { Input } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";
import { Alert } from "@/src/components/ui/Alert";
import { Modal } from "@/src/components/ui/overlays";
import { canConfirmDelete } from "@/src/components/auth/form";
import { useSession } from "@/src/components/auth/useSession";
import { api, apiFetch, ApiError } from "@/src/lib/api";

interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  my_role: string;
}
interface MemberRow {
  id: string;
  name: string;
  email: string;
  role: string;
}
interface UsageRow {
  kind: string;
  provider: string | null;
  status: string;
  created_at: string;
}

/** First workspace the signed-in user belongs to (their default). */
function useWorkspace() {
  const session = useSession();
  const [workspace, setWorkspace] = useState<WorkspaceRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (session.status !== "signed-in") return;
    apiFetch<WorkspaceRow[]>("/api/v1/workspaces")
      .then((rows) => setWorkspace(rows[0] ?? null))
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : "Could not load workspace."));
  }, [session.status]);
  return { session, workspace, setWorkspace, error };
}

function SignedOutNote() {
  return (
    <p className="text-sm text-muted-text">
      <Link href="/login" className="font-medium text-foreground underline">Sign in</Link> to manage your workspace.
    </p>
  );
}

export function WorkspacePanel() {
  const { session, workspace, setWorkspace, error } = useWorkspace();
  const [name, setName] = useState("");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!workspace) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed the editable name once the workspace loads.
    setName(workspace.name);
    apiFetch<MemberRow[]>(`/api/v1/workspaces/${workspace.id}/members`).then(setMembers).catch(() => setMembers([]));
  }, [workspace]);

  if (session.status === "signed-out") return <SignedOutNote />;
  if (error) return <Alert tone="bad" title="Workspace unavailable">{error}</Alert>;
  if (!workspace) return <p className="text-sm text-muted-text">Loading workspace…</p>;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace || !name.trim()) return;
    setBusy(true);
    try {
      const updated = await api.patch<WorkspaceRow>(`/api/v1/workspaces/${workspace.id}`, { name: name.trim() });
      setWorkspace({ ...workspace, ...updated });
      setResult({ ok: true, message: "Workspace saved." });
    } catch (err) {
      setResult({ ok: false, message: err instanceof ApiError ? err.details?.[0] ?? err.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid max-w-3xl gap-4">
      <form onSubmit={save} className="grid gap-4 rounded-xl border border-border p-5 sm:grid-cols-2" aria-label="Workspace settings">
        <Input label="Workspace name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Slug" value={workspace.slug} disabled hint="Set when the workspace was created." />
        <div className="space-y-3 sm:col-span-2">
          <Button type="submit" loading={busy} disabled={workspace.my_role !== "owner" && workspace.my_role !== "admin"}>
            Save workspace
          </Button>
          {result && (
            <p role="status" className={`rounded-lg p-3 text-sm ${result.ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
              {result.message}
            </p>
          )}
        </div>
      </form>
      <section aria-label="Members" className="rounded-xl border border-border p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Users className="size-4 text-muted-text" aria-hidden="true" />
          Members ({members.length})
        </h3>
        <ul className="mt-3 space-y-1.5">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                {m.name} <span className="text-xs text-muted-text">{m.email}</span>
              </span>
              <Badge tone="neutral">{m.role}</Badge>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function BillingPanel() {
  const { session, workspace } = useWorkspace();
  const [usage, setUsage] = useState<UsageRow[] | null>(null);

  useEffect(() => {
    if (!workspace) return;
    apiFetch<UsageRow[]>(`/api/v1/usage?workspaceId=${workspace.id}&limit=100`).then(setUsage).catch(() => setUsage([]));
  }, [workspace]);

  if (session.status === "signed-out") return <SignedOutNote />;

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const thisMonth = (usage ?? []).filter((u) => new Date(u.created_at).getTime() >= monthStart);
  const byKind = thisMonth.reduce<Record<string, number>>((acc, u) => {
    const key = `${u.provider ?? "local"} · ${u.kind}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="grid max-w-3xl gap-4">
      <section aria-label="Current plan" className="rounded-xl border border-border p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Current plan</h3>
          <Badge tone="ok">Free</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-text">All studios included. No payment method on file and no charges.</p>
      </section>
      <section aria-label="Usage this month" className="rounded-xl border border-border p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="size-4 text-muted-text" aria-hidden="true" />
          AI and research usage this month
        </h3>
        {usage === null ? (
          <p className="mt-2 text-sm text-muted-text">Loading usage…</p>
        ) : Object.keys(byKind).length === 0 ? (
          <p className="mt-2 text-sm text-muted-text">No generation or YouTube calls yet this month.</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {Object.entries(byKind).map(([k, n]) => (
              <li key={k} className="flex justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
                <span className="capitalize">{k}</span>
                <span className="tabular-nums font-medium">{n}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const EXPORT_KEYS = [
  "tuberack.workspace.v1",
  "tuberack.intel.v1",
  "tuberack.scripts.v1",
  "tuberack.media.v1",
  "tuberack.video.v1",
  "tuberack.package.v1",
  "tuberack.analytics.v1",
];

export function DataPanel() {
  const session = useSession();
  const [confirming, setConfirming] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function exportAll() {
    const data: Record<string, unknown> = { exportedAt: new Date().toISOString(), account: session.user ?? null };
    for (const key of EXPORT_KEYS) {
      try {
        const raw = localStorage.getItem(key);
        data[key] = raw ? JSON.parse(raw) : null;
      } catch {
        data[key] = null;
      }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tuberack-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteAccount() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/v1/auth/account/delete", { confirm: "DELETE" });
      for (const key of EXPORT_KEYS) {
        try {
          localStorage.removeItem(key);
        } catch {
          // storage unavailable — nothing to clear
        }
      }
      // Full navigation: the session cookie is gone.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete the account.");
      setBusy(false);
    }
  }

  return (
    <div className="grid max-w-3xl gap-4">
      <section className="rounded-xl border border-border p-5" aria-label="Data export">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Download className="size-4 text-muted-text" aria-hidden="true" />
          Export your data
        </h3>
        <p className="mt-1 text-sm text-muted-text">
          Download projects, intelligence, scripts, media details, compositions, packaging, and analytics as one JSON file.
        </p>
        <Button variant="outline" className="mt-4" onClick={exportAll}>
          Download export
        </Button>
      </section>

      {session.status === "signed-in" && (
        <section aria-label="Delete account" className="rounded-xl border border-destructive/40 p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <Trash2 className="size-4" aria-hidden="true" />
            Delete account
          </h3>
          <p className="mt-1 text-sm text-muted-text">
            Deletion removes the account, workspaces, projects, assets, and history. This cannot be undone.
          </p>
          <Button variant="destructive" className="mt-3" onClick={() => { setConfirming(true); setPhrase(""); }}>
            Delete my account…
          </Button>
        </section>
      )}

      {confirming && (
        <Modal title="Delete account?" description="Final confirmation. Read carefully." onClose={() => setConfirming(false)}>
          <div className="space-y-4">
            <Alert tone="bad" title="Irreversible">
              Projects, brand profiles, usage history, and analytics for every workspace you own are destroyed with the account.
            </Alert>
            <Input label="Type DELETE to confirm" value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="DELETE" autoComplete="off" />
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button variant="destructive" loading={busy} disabled={!canConfirmDelete(phrase)} onClick={() => void deleteAccount()}>
                Delete everything
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
