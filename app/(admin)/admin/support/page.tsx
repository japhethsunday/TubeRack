"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Headset, RefreshCw, RotateCcw, Send, UserRound } from "lucide-react";
import { api } from "@/src/lib/api";
import { Button } from "@/src/components/ui/Button";
import { cx } from "@/src/components/ui/cx";
import { AiWriter, Loading, PageTitle, Panel, errorText, when } from "@/src/components/admin/kit";

type Status = "handoff" | "open" | "resolved" | "all";
interface Row { id: string; status: string; subject: string; category: string; unread: boolean; summary: string; messages: number; email: string; name: string; updatedAt: string }
interface ListData { counts: { handoff: number; open: number; resolved: number; unread: number }; conversations: Row[] }
interface Snapshot {
  account: { emailVerified: boolean; status: string; joined: string };
  credits: { balance: number | "unlimited"; monthlyAllowance: number; nextRefill: string | null } | null;
  failedGenerationsLast7Days: number;
  projectCount: number;
  youtube: { connected: boolean; channel: string | null };
  recentJobs: { when: string; type: string; status: string; error: string | null }[];
}
interface Detail {
  id: string; userId: string; status: string; subject: string; category: string; summary: string; email: string; name: string; verified: boolean;
  messages: { id: string; role: string; body: string; createdAt: string }[];
  snapshot: Snapshot | null;
}

const TABS: { key: Status; label: string }[] = [
  { key: "handoff", label: "Needs a person" },
  { key: "open", label: "Assistant handling" },
  { key: "resolved", label: "Solved" },
  { key: "all", label: "All" },
];

export default function AdminSupport() {
  const [tab, setTab] = useState<Status>("handoff");
  const [list, setList] = useState<ListData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setList(await api.get<ListData>(`/api/v1/admin/support?status=${tab}`));
    } catch (e) {
      setError(errorText(e));
    }
  }, [tab]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setDetail(await api.get<Detail>(`/api/v1/admin/support/${id}`));
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load from the backend when the tab changes.
    void load();
  }, [load]);

  // Deep link from the hand-over email: /admin/support?c=<id>
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("c");
    if (c) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- open the linked conversation once.
      setOpenId(c);
      void loadDetail(c);
    }
  }, [loadDetail]);

  function open(id: string) {
    setOpenId(id);
    setDetail(null);
    setReply("");
    setMsg(null);
    void loadDetail(id);
  }

  async function act(action: "reply" | "resolve" | "reopen", resolveAfter = false) {
    if (!detail) return;
    if (action === "reply" && !window.confirm(`Send this reply to ${detail.email}? It appears in their support chat and is emailed to them.`)) return;
    setBusy(resolveAfter ? "reply-resolve" : action);
    setMsg(null);
    try {
      const r = await api.post<{ emailed?: boolean }>(`/api/v1/admin/support/${detail.id}`, { action, message: reply, resolveAfter });
      if (action === "reply") {
        setReply("");
        setMsg({ ok: true, text: r.emailed ? `Sent in the chat and emailed to ${detail.email}.` : "Sent in the chat (the email couldn't be sent — their address isn't verified)." });
      }
      await Promise.all([loadDetail(detail.id), load()]);
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
    setBusy(null);
  }

  const s = detail?.snapshot;
  return (
    <>
      <PageTitle
        title="Support"
        sub="Chats with the in-app assistant. Anything it can't solve lands in “Needs a person”."
        actions={<Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="size-4" aria-hidden="true" /> Refresh</Button>}
      />
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <div className={cx("space-y-3", openId && "hidden xl:block")}>
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-surface p-1 text-xs font-medium sm:grid-cols-4 xl:grid-cols-2" role="tablist">
            {TABS.map((t) => (
              <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={cx("rounded-md px-2 py-1.5", tab === t.key ? "bg-primary/15 text-primary" : "text-muted-text hover:bg-muted")}>
                {t.label}
                {list && t.key !== "all" ? ` · ${list.counts[t.key]}` : ""}
              </button>
            ))}
          </div>
          {!list ? <Loading error={error} onRetry={() => void load()} /> : (
            <Panel>
              {list.conversations.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-text"><Headset className="mx-auto mb-2 size-8 opacity-50" aria-hidden="true" />Nothing here right now.</p>
              ) : (
                <ul className="-m-4 divide-y divide-border">
                  {list.conversations.map((c) => (
                    <li key={c.id}>
                      <button onClick={() => open(c.id)} className={cx("flex w-full gap-3 px-4 py-3 text-left", openId === c.id ? "bg-primary/10" : "hover:bg-muted")}>
                        <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", c.unread ? "bg-destructive" : c.status === "handoff" ? "bg-warning" : c.status === "resolved" ? "bg-success" : "bg-sky-400")} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-sm font-semibold">{c.name || c.email}</span>
                            <span className="shrink-0 text-[11px] text-muted-text">{when(c.updatedAt)}</span>
                          </span>
                          <span className="block truncate text-sm">{c.subject || "Support request"}</span>
                          <span className="block truncate text-xs text-muted-text">{c.summary || `${c.messages} messages · ${c.category || "general"}`}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </div>

        <div className={cx(!openId && "hidden xl:block")}>
          {!openId ? (
            <Panel><p className="py-16 text-center text-sm text-muted-text">Choose a conversation.</p></Panel>
          ) : !detail ? (
            <Loading error={msg && !msg.ok ? msg.text : null} onRetry={() => open(openId)} />
          ) : (
            <div className="space-y-4">
              <button onClick={() => setOpenId(null)} className="inline-flex items-center gap-1 text-sm text-muted-text hover:text-foreground xl:hidden"><ArrowLeft className="size-4" /> Back</button>
              <Panel
                title={detail.subject || "Support request"}
                right={
                  detail.status === "resolved"
                    ? <Button size="sm" variant="ghost" loading={busy === "reopen"} onClick={() => void act("reopen")}><RotateCcw className="size-4" /> Reopen</Button>
                    : <Button size="sm" variant="ghost" loading={busy === "resolve"} onClick={() => void act("resolve")}><CheckCircle2 className="size-4" /> Mark solved</Button>
                }
              >
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-text">
                  <a href={`/admin/users/${detail.userId}`} className="font-medium text-foreground hover:text-primary hover:underline">{detail.name || detail.email}</a>
                  <span>{detail.email}{detail.verified ? "" : " (unverified)"}</span>
                  <span className="capitalize">{detail.category || "general"}</span>
                  <span>{detail.status === "handoff" ? "Needs a person" : detail.status === "resolved" ? "Solved" : "Assistant handling"}</span>
                </div>
                {s && (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div className="rounded-lg bg-muted p-2"><div className="text-muted-text">Credits</div><div className="font-semibold">{s.credits ? (s.credits.balance === "unlimited" ? "∞" : `${s.credits.balance} / ${s.credits.monthlyAllowance}`) : "—"}</div></div>
                    <div className="rounded-lg bg-muted p-2"><div className="text-muted-text">Projects</div><div className="font-semibold">{s.projectCount}</div></div>
                    <div className="rounded-lg bg-muted p-2"><div className="text-muted-text">YouTube</div><div className="truncate font-semibold">{s.youtube.connected ? s.youtube.channel || "Connected" : "Not connected"}</div></div>
                    <div className="rounded-lg bg-muted p-2"><div className="text-muted-text">Failed (7d)</div><div className={cx("font-semibold", s.failedGenerationsLast7Days > 0 && "text-destructive")}>{s.failedGenerationsLast7Days}</div></div>
                  </div>
                )}
                {detail.summary && (
                  <div className="mt-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-warning">Hand-over summary</div>
                    {detail.summary}
                  </div>
                )}
              </Panel>

              <Panel title="Conversation">
                <div className="max-h-[440px] space-y-3 overflow-y-auto pr-1">
                  {detail.messages.map((m) => (
                    <div key={m.id} className={cx("flex flex-col", m.role === "user" ? "items-start" : "items-end")}>
                      <span className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-text">
                        {m.role === "user" ? <><UserRound className="size-3" /> {detail.name || "Creator"}</> : m.role === "admin" ? "You (team)" : m.role === "system" ? "Note" : "Assistant"} · {when(m.createdAt)}
                      </span>
                      <div className={cx("max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm", m.role === "user" ? "rounded-bl-md bg-muted" : m.role === "admin" ? "rounded-br-md bg-primary/15" : m.role === "system" ? "bg-transparent text-xs italic text-muted-text" : "rounded-br-md border border-border")}>
                        {m.body}
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="Reply as the Recktube team">
                <div className="space-y-3 text-sm">
                  <AiWriter
                    title="Draft with AI"
                    hint="Reads the whole chat, the hand-over summary and their account, then drafts the team's answer. Review before sending."
                    placeholder="Optional: e.g. “I've added 200 credits and fixed the export — tell them to try again”"
                    hasDraft={Boolean(reply.trim())}
                    onWrite={async (instruction) => {
                      const d = await api.post<{ message: string }>(`/api/v1/admin/support/${detail.id}/draft`, { instruction });
                      setReply(d.message);
                    }}
                  />
                  <textarea rows={8} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={8000} placeholder="Write your reply…" className="w-full rounded-lg border border-border bg-background px-2.5 py-2" />
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={!reply.trim()} loading={busy === "reply"} onClick={() => void act("reply")}><Send className="size-4" /> Send reply</Button>
                    <Button variant="outline" disabled={!reply.trim()} loading={busy === "reply-resolve"} onClick={() => void act("reply", true)}><CheckCircle2 className="size-4" /> Send & mark solved</Button>
                  </div>
                  <p className="text-xs text-muted-text">Your reply shows in their support chat and is emailed from support@recktube.xyz on the Recktube design.</p>
                  {msg && <p className={cx("text-xs", msg.ok ? "text-success" : "text-destructive")}>{msg.text}</p>}
                </div>
              </Panel>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
