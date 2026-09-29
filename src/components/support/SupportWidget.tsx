"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft, CheckCircle2, Headset, Mail, MessageSquarePlus, Send, UserRound, X } from "lucide-react";
import { api, ApiError } from "@/src/lib/api";
import { useSession } from "@/src/components/auth/useSession";
import { cx } from "@/src/components/ui/cx";

type Role = "user" | "assistant" | "admin" | "system";
interface Msg { id: string; role: Role; body: string; createdAt: string }
interface Conversation { id: string; status: "open" | "handoff" | "resolved"; subject: string; messages: Msg[] }
interface Summary { id: string; status: string; subject: string; updatedAt: string; userUnread: boolean }

const SUGGESTIONS = ["A generation or export failed", "Questions about my credits", "Connecting my YouTube channel", "Growing and monetising my channel"];

const errText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** Replies may carry light markdown: show **bold** as bold and tidy bullets/headings instead of raw symbols. */
function Rich({ text }: { text: string }) {
  const clean = text
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^(\s*)[*-]\s+/gm, "$1• ")
    .replace(/`([^`]+)`/g, "$1");
  return (
    <>
      {clean.split(/(\*\*[^*]+\*\*|__[^_]+__)/g).map((part, i) =>
        /^(\*\*|__).+\1$/.test(part) ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong> : part.replace(/(^|\s)[*_]([^*_\n]+)[*_](?=\s|[.,!?;:]|$)/g, "$1$2"),
      )}
    </>
  );
}

function Bubble({ m }: { m: Msg }) {
  if (m.role === "system") return <p className="support-in mx-auto max-w-[85%] text-center text-[11px] text-muted-text">{m.body}</p>;
  const mine = m.role === "user";
  return (
    <div className={cx("support-in flex flex-col", mine ? "items-end" : "items-start")}>
      {m.role === "admin" && <span className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary"><UserRound className="size-3" /> Recktube team</span>}
      <div
        className={cx(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
          mine ? "rounded-br-md bg-gradient-to-br from-fuchsia-600 via-violet-600 to-sky-600 text-white" : m.role === "admin" ? "rounded-bl-md border border-primary/40 bg-primary/10" : "rounded-bl-md bg-muted",
        )}
      >
        {mine ? m.body : <Rich text={m.body} />}
      </div>
      <span className="mt-0.5 px-1 text-[10px] text-muted-text">{time(m.createdAt)}</span>
    </div>
  );
}

/** In-app support: a floating assistant that answers from the user's own account and hands over to the team. */
export function SupportWidget() {
  const session = useSession();
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"chat" | "list">("chat");
  const [list, setList] = useState<Summary[]>([]);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const seq = useRef(0);
  const signedIn = session.status === "signed-in";
  const firstName = (session.user?.name ?? "").split(" ")[0];
  const unread = list.some((c) => c.userUnread);

  const loadList = useCallback(async () => {
    try {
      setList(await api.get<Summary[]>("/api/v1/support"));
    } catch {
      // badge only; ignore
    }
  }, []);

  // Open from email links (?support=open) and keep the unread badge fresh.
  useEffect(() => {
    if (!signedIn) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- open once when arriving from an email link.
    if (new URLSearchParams(window.location.search).get("support") === "open") setOpen(true);
    void loadList();
    const id = window.setInterval(() => document.visibilityState === "visible" && void loadList(), 60_000);
    return () => window.clearInterval(id);
  }, [signedIn, loadList]);

  // While a teammate owns the chat, check for their replies.
  useEffect(() => {
    if (!open || !conv || conv.status !== "handoff") return;
    const id = window.setInterval(async () => {
      try {
        setConv(await api.get<Conversation>(`/api/v1/support/${conv.id}`));
      } catch {
        // keep the current view
      }
    }, 15_000);
    return () => window.clearInterval(id);
  }, [open, conv]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [conv?.messages.length, busy, open]);

  if (!signedIn || pathname.startsWith("/studio/video")) return null;

  async function openConversation(id: string) {
    setNote(null);
    try {
      setConv(await api.get<Conversation>(`/api/v1/support/${id}`));
      setView("chat");
      void loadList();
    } catch (e) {
      setNote({ ok: false, text: errText(e) });
    }
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setNote(null);
    setDraft("");
    seq.current += 1;
    const optimistic: Msg = { id: `tmp-${seq.current}`, role: "user", body: message, createdAt: new Date().toISOString() };
    setConv((c) => (c ? { ...c, messages: [...c.messages, optimistic] } : { id: "", status: "open", subject: "", messages: [optimistic] }));
    try {
      const next = await api.post<Conversation>("/api/v1/support", { conversationId: conv?.id || null, message });
      setConv(next);
      void loadList();
    } catch (e) {
      setConv((c) => (c ? { ...c, messages: c.messages.filter((m) => m.id !== optimistic.id) } : null));
      setDraft(message);
      setNote({ ok: false, text: errText(e) });
    }
    setBusy(false);
    inputRef.current?.focus();
  }

  async function act(action: "human" | "resolve" | "email") {
    if (!conv?.id || busy) return;
    setBusy(true);
    setNote(null);
    try {
      if (action === "email") {
        const r = await api.post<{ to: string }>(`/api/v1/support/${conv.id}`, { action });
        setNote({ ok: true, text: `A copy of this chat is on its way to ${r.to}.` });
      } else {
        setConv(await api.post<Conversation>(`/api/v1/support/${conv.id}`, { action }));
        if (action === "resolve") setNote({ ok: true, text: "Marked as solved. Glad we could help!" });
        void loadList();
      }
    } catch (e) {
      setNote({ ok: false, text: errText(e) });
    }
    setBusy(false);
  }

  function newChat() {
    setConv(null);
    setView("chat");
    setNote(null);
    window.setTimeout(() => inputRef.current?.focus(), 50);
  }

  const status = conv?.status;
  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open Recktube Support"
          style={{ bottom: "calc(1.25rem + var(--tabbar, env(safe-area-inset-bottom)))" }}
          className="support-launch fixed right-5 z-[70] flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-600 via-violet-600 to-sky-600 text-white shadow-xl shadow-violet-900/40 transition-transform hover:scale-105"
        >
          <span className="support-ring absolute inset-0 rounded-full" aria-hidden="true" />
          <Headset className="relative size-6" aria-hidden="true" />
          {unread && <span className="absolute right-0.5 top-0.5 size-3.5 rounded-full border-2 border-background bg-destructive" aria-label="New reply" />}
        </button>
      )}

      {open && (
        <section
          role="dialog"
          aria-label="Recktube Support"
          className="support-panel fixed inset-x-2 bottom-2 z-[70] flex h-[min(640px,calc(100dvh-1rem))] flex-col overflow-hidden rounded-2xl border border-border bg-elevated shadow-2xl shadow-black/40 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[390px]"
        >
          {/* Header */}
          <header className="relative overflow-hidden bg-gradient-to-br from-fuchsia-600 via-violet-700 to-sky-600 px-4 py-3 text-white">
            <div className="auth-grid absolute inset-0 opacity-50" aria-hidden="true" />
            <div className="relative flex items-center gap-3">
              {view === "chat" && (conv || list.length > 0) ? (
                <button type="button" onClick={() => { setView("list"); void loadList(); }} aria-label="All conversations" className="rounded-md p-1 hover:bg-white/15">
                  <ArrowLeft className="size-4" />
                </button>
              ) : null}
              <span className="flex size-9 items-center justify-center rounded-xl bg-white/15"><Headset className="size-5" aria-hidden="true" /></span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="text-sm font-semibold">Recktube Support</p>
                <p className="flex items-center gap-1.5 text-[11px] text-white/80">
                  <span className={cx("size-1.5 rounded-full", status === "handoff" ? "bg-amber-300" : "bg-emerald-300")} />
                  {status === "handoff" ? "With the team — we'll reply here and by email" : "Online · typically replies in seconds"}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close support" className="rounded-md p-1 hover:bg-white/15">
                <X className="size-5" />
              </button>
            </div>
          </header>

          {view === "list" ? (
            <div className="flex-1 overflow-y-auto p-3">
              <button type="button" onClick={newChat} className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/50 py-2.5 text-sm font-medium text-primary hover:bg-primary/5">
                <MessageSquarePlus className="size-4" /> New conversation
              </button>
              <ul className="space-y-1.5">
                {list.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => void openConversation(c.id)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-muted">
                      <span className={cx("size-2 shrink-0 rounded-full", c.userUnread ? "bg-destructive" : c.status === "handoff" ? "bg-amber-400" : c.status === "resolved" ? "bg-emerald-400" : "bg-sky-400")} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{c.subject || "Support request"}</span>
                        <span className="block text-[11px] text-muted-text">
                          {c.status === "handoff" ? "With the team" : c.status === "resolved" ? "Solved" : "Open"} · {new Date(c.updatedAt).toLocaleDateString()}
                          {c.userUnread ? " · new reply" : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
                {!conv?.messages.length && (
                  <div className="support-in space-y-3">
                    <div className="rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5 text-sm leading-relaxed">
                      <p className="font-medium">Hello{firstName ? ` ${firstName}` : ""}, welcome to Recktube Support.</p>
                      <p className="mt-1 text-muted-text">How can we help you today? Choose a topic or type your question — we&apos;ll look into your account and, if needed, bring in a member of our team.</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {SUGGESTIONS.map((s) => (
                        <button key={s} type="button" onClick={() => void send(s)} className="rounded-full border border-border px-3 py-1.5 text-xs hover:border-primary hover:text-primary">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {conv?.messages.map((m) => <Bubble key={m.id} m={m} />)}
                {busy && (
                  <div className="flex items-center gap-1 px-1" aria-label="Recktube Support is typing">
                    <span className="support-dot" /><span className="support-dot" style={{ animationDelay: "0.15s" }} /><span className="support-dot" style={{ animationDelay: "0.3s" }} />
                  </div>
                )}
                <div ref={endRef} />
              </div>

              {note && <p role="status" className={cx("mx-3 mb-2 rounded-lg px-3 py-2 text-xs", note.ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>{note.text}</p>}

              {conv?.id && (
                <div className="flex flex-wrap gap-1.5 border-t border-border px-3 pt-2">
                  {status !== "handoff" && status !== "resolved" && (
                    <button type="button" disabled={busy} onClick={() => void act("human")} className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium hover:bg-primary/10 hover:text-primary">
                      <UserRound className="size-3" /> Talk to a person
                    </button>
                  )}
                  <button type="button" disabled={busy} onClick={() => void act("email")} className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium hover:bg-primary/10 hover:text-primary">
                    <Mail className="size-3" /> Email me this chat
                  </button>
                  {status !== "resolved" && (
                    <button type="button" disabled={busy} onClick={() => void act("resolve")} className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium hover:bg-success/10 hover:text-success">
                      <CheckCircle2 className="size-3" /> Solved
                    </button>
                  )}
                </div>
              )}

              <form
                className="flex items-end gap-2 p-3"
                style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(draft);
                }}
              >
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={draft}
                  maxLength={1500}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send(draft);
                    }
                  }}
                  placeholder={status === "resolved" ? "Ask something else…" : "Type your question…"}
                  aria-label="Message Recktube Support"
                  className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-base sm:text-sm"
                />
                <button
                  type="submit"
                  disabled={busy || !draft.trim()}
                  aria-label="Send"
                  className="flex size-[42px] shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-600 via-violet-600 to-sky-600 text-white disabled:opacity-40"
                >
                  <Send className="size-4" />
                </button>
              </form>
            </>
          )}
        </section>
      )}
    </>
  );
}
