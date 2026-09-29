"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Crown, Eye, Inbox, LifeBuoy, Briefcase, Paperclip, RefreshCw, Reply, Send, ShieldCheck } from "lucide-react";
import { api } from "@/src/lib/api";
import { Button } from "@/src/components/ui/Button";
import { cx } from "@/src/components/ui/cx";
import { AiWriter, Loading, PageTitle, Panel, errorText, when } from "@/src/components/admin/kit";

type Mailbox = "support" | "security" | "founder" | "owner";
const BOXES: Mailbox[] = ["support", "security", "founder", "owner"];
const BOX_LABEL: Record<Mailbox, string> = { support: "Support", security: "Security", founder: "Founder", owner: "Owner" };
interface Summary { id: string; from: string; fromName: string; subject: string; mailbox: Mailbox; receivedAt: string; attachments: number }
interface Full extends Summary { to: string[]; replyTo: string; html: string | null; text: string | null }

const REPLIED_KEY = "admin-inbox-replied";
function loadReplied(): string[] {
  try {
    return JSON.parse(localStorage.getItem(REPLIED_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

const MailboxIcon = ({ m, className }: { m: Mailbox; className?: string }) =>
  m === "security" ? <ShieldCheck className={cx("text-warning", className)} aria-hidden="true" />
  : m === "founder" ? <Crown className={cx("text-fuchsia-400", className)} aria-hidden="true" />
  : m === "owner" ? <Briefcase className={cx("text-success", className)} aria-hidden="true" />
  : <LifeBuoy className={cx("text-primary", className)} aria-hidden="true" />;

export default function AdminInbox() {
  const [emails, setEmails] = useState<Summary[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | Mailbox>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [open, setOpen] = useState<Full | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [replied, setReplied] = useState<string[]>([]);

  // Reply composer
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [from, setFrom] = useState<Mailbox>("support");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function load(after?: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ emails: Summary[]; next: string | null }>(`/api/v1/admin/inbox${after ? `?after=${after}` : ""}`);
      setEmails((prev) => (after && prev ? [...prev, ...res.emails] : res.emails));
      setNext(res.next);
    } catch (e) {
      setError(errorText(e));
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- first load from the backend and local "replied" marks.
    setReplied(loadReplied());
    void load();
  }, []);

  useEffect(() => {
    if (!openId) return;
    let live = true;
    api
      .get<Full>(`/api/v1/admin/inbox/${openId}`)
      .then((e) => {
        if (!live) return;
        setOpen(e);
        setFrom(e.mailbox);
        setName(e.fromName.split(" ")[0] ?? "");
      })
      .catch((e) => live && setOpenError(errorText(e)));
    return () => {
      live = false;
    };
  }, [openId]);

  function select(id: string) {
    setOpenId(id);
    setOpen(null);
    setOpenError(null);
    setMessage("");
    setPreview(null);
    setMsg(null);
  }

  async function showPreview() {
    if (!open || !message.trim()) return;
    try {
      const res = await api.post<{ html: string }>(`/api/v1/admin/inbox/${open.id}`, { message, name, mailbox: from, preview: true });
      setPreview(res.html);
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  }

  async function send() {
    if (!open || !window.confirm(`Send this reply from ${from}@recktube.xyz to ${open.replyTo}?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      await api.post(`/api/v1/admin/inbox/${open.id}`, { message, name, mailbox: from });
      const nextReplied = [...new Set([...replied, open.id])].slice(-500);
      setReplied(nextReplied);
      try {
        localStorage.setItem(REPLIED_KEY, JSON.stringify(nextReplied));
      } catch {
        // storage unavailable; the mark just won't persist
      }
      setMsg({ ok: true, text: `Reply sent from ${from}@recktube.xyz to ${open.replyTo}.` });
      setMessage("");
      setPreview(null);
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
    setBusy(false);
  }

  const shown = useMemo(() => (emails ?? []).filter((e) => filter === "all" || e.mailbox === filter), [emails, filter]);
  const counts = useMemo(() => Object.fromEntries(BOXES.map((b) => [b, (emails ?? []).filter((e) => e.mailbox === b).length])) as Record<Mailbox, number>, [emails]);

  return (
    <>
      <PageTitle
        title="Inbox"
        sub="Mail sent to support@, security@, founder@ and owner@recktube.xyz. Replies go out on the Recktube design from the same address."
        actions={<Button size="sm" variant="outline" loading={loading} onClick={() => void load()}><RefreshCw className="size-4" aria-hidden="true" /> Refresh</Button>}
      />
      {!emails ? (
        <Loading error={error} onRetry={() => void load()} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
          <div className={cx("space-y-3", openId && "hidden xl:block")}>
            <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1 text-xs font-medium" role="tablist" aria-label="Mailbox">
              {([["all", `All · ${emails.length}`], ...BOXES.map((b) => [b, `${BOX_LABEL[b]} · ${counts[b]}`])] as [("all" | Mailbox), string][]).map(([k, label]) => (
                <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={cx("flex-1 rounded-md px-2 py-1.5", filter === k ? "bg-primary/15 text-primary" : "text-muted-text hover:bg-muted")}>
                  {label}
                </button>
              ))}
            </div>
            {error && <Loading error={error} onRetry={() => void load()} />}
            <Panel>
              {shown.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-text">
                  <Inbox className="mx-auto mb-2 size-8 opacity-50" aria-hidden="true" />
                  No mail yet. New messages to support@, security@, founder@ and owner@ show up here.
                </div>
              ) : (
                <ul className="-m-4 divide-y divide-border">
                  {shown.map((e) => (
                    <li key={e.id}>
                      <button onClick={() => select(e.id)} className={cx("flex w-full gap-3 px-4 py-3 text-left", openId === e.id ? "bg-primary/10" : "hover:bg-muted")}>
                        <MailboxIcon m={e.mailbox} className="mt-0.5 size-4 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-sm font-semibold">{e.fromName || e.from}</span>
                            <span className="shrink-0 text-[11px] text-muted-text">{when(e.receivedAt)}</span>
                          </span>
                          <span className="block truncate text-sm text-muted-text">{e.subject}</span>
                          <span className="mt-1 flex items-center gap-2 text-[11px] text-muted-text">
                            {e.attachments > 0 && <span className="inline-flex items-center gap-0.5"><Paperclip className="size-3" aria-hidden="true" />{e.attachments}</span>}
                            {replied.includes(e.id) && <span className="rounded bg-success/15 px-1.5 py-0.5 font-medium text-success">Replied</span>}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            {next && <Button variant="ghost" className="w-full" loading={loading} onClick={() => void load(next)}>Load older</Button>}
          </div>

          <div className={cx(!openId && "hidden xl:block")}>
            {!openId ? (
              <Panel><p className="py-16 text-center text-sm text-muted-text">Choose a message to read and reply.</p></Panel>
            ) : !open ? (
              <Loading error={openError} onRetry={() => select(openId)} />
            ) : (
              <div className="space-y-4">
                <button onClick={() => setOpenId(null)} className="inline-flex items-center gap-1 text-sm text-muted-text hover:text-foreground xl:hidden">
                  <ArrowLeft className="size-4" aria-hidden="true" /> Back to inbox
                </button>
                <Panel>
                  <h2 className="text-lg font-semibold">{open.subject}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-text">
                    <span><span className="font-medium text-foreground">{open.fromName || open.from}</span> &lt;{open.replyTo}&gt;</span>
                    <span className="inline-flex items-center gap-1"><MailboxIcon m={open.mailbox} className="size-3.5" /> to {open.mailbox}@recktube.xyz</span>
                    <span>{when(open.receivedAt)}</span>
                    {open.attachments > 0 && <span className="inline-flex items-center gap-1"><Paperclip className="size-3" aria-hidden="true" />{open.attachments} attachment{open.attachments > 1 ? "s" : ""} (open in Gmail)</span>}
                  </div>
                  <div className="mt-4 border-t border-border pt-4">
                    {open.html ? (
                      <iframe title="Message" srcDoc={open.html} sandbox="" className="h-[420px] w-full rounded-lg bg-white" />
                    ) : (
                      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap font-sans text-sm">{open.text || "(empty message)"}</pre>
                    )}
                  </div>
                </Panel>

                <Panel title="Reply" right={<Reply className="size-4 text-muted-text" aria-hidden="true" />}>
                  <div className="space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-1 rounded-lg border border-border p-1" role="radiogroup" aria-label="Reply from">
                      {BOXES.map((m) => (
                        <button key={m} role="radio" aria-checked={from === m} onClick={() => setFrom(m)} className={cx("flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium", from === m ? "bg-primary/15 text-primary" : "text-muted-text hover:bg-muted")}>
                          <MailboxIcon m={m} className="size-3.5" /> {m}@recktube.xyz
                        </button>
                      ))}
                    </div>
                    <AiWriter
                      title="Reply with AI"
                      hint="Reads this message and the sender's account, then drafts an answer in the Recktube voice. Review it before sending."
                      placeholder="Optional: guide the reply — e.g. “tell them the export bug is fixed and add 200 credits as a thank-you”"
                      hasDraft={Boolean(message.trim())}
                      onWrite={async (instruction) => {
                        const d = await api.post<{ name: string; message: string }>(`/api/v1/admin/inbox/${open.id}/draft`, { instruction, mailbox: from });
                        if (d.name) setName(d.name);
                        setMessage(d.message);
                        setPreview(null);
                        setMsg(null);
                      }}
                    />
                    <label className="block space-y-1">
                      <span className="text-xs text-muted-text">Greeting name</span>
                      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ada" className="h-9 w-full rounded-lg border border-border bg-background px-2.5" />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-muted-text">Message *</span>
                      <textarea rows={10} value={message} onChange={(e) => { setMessage(e.target.value); setPreview(null); }} maxLength={8000} placeholder="Thanks for reaching out…" className="w-full rounded-lg border border-border bg-background px-2.5 py-2" />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={!message.trim()} loading={busy} onClick={() => void send()}><Send className="size-4" aria-hidden="true" /> Send reply</Button>
                      <Button variant="outline" disabled={!message.trim()} onClick={() => void showPreview()}><Eye className="size-4" aria-hidden="true" /> Preview</Button>
                    </div>
                    {msg && <p className={cx("text-xs", msg.ok ? "text-success" : "text-destructive")}>{msg.text}</p>}
                    {preview && <iframe title="Reply preview" srcDoc={preview} sandbox="" className="h-[620px] w-full rounded-lg bg-white" />}
                  </div>
                </Panel>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
