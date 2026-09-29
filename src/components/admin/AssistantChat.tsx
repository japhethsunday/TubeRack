"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, History, Loader2, Plus, Search, Send, ShieldCheck, Trash2, X } from "lucide-react";
import { useAssistantChats } from "@/src/components/admin/AssistantLauncher";
import { api, ApiError } from "@/src/lib/api";
import { Button } from "@/src/components/ui/Button";
import { cx } from "@/src/components/ui/cx";

export interface Proposal { action: string; summary: string; token: string; state?: "idle" | "busy" | "done" | "error" | "dismissed"; result?: string }
export interface Turn { role: "admin" | "assistant"; text: string; proposals?: Proposal[]; lookups?: string[]; open?: string }

const STARTERS = [
  "How is the business doing this week?",
  "Any suspicious accounts or fraud?",
  "What failed in the last 24 hours?",
  "Who is waiting for support?",
  "Email everyone a note from the founder",
  "Anything new for founder@ or owner@?",
  "Where are new sign-ups coming from?",
];

const LOOKUP_LABEL: Record<string, string> = {
  business_overview: "business numbers",
  find_users: "accounts",
  user_details: "account details",
  recent_failures: "failures",
  support_queue: "support queue",
  inbox: "inbox",
  growth_report: "sign-up sources",
  affiliates_overview: "affiliates",
  safety_flags: "safety flags",
  tool_switches: "tool switches",
};

/**
 * The admin assistant chat. Admin console only — it has its own endpoint and
 * shares nothing with the creators' support chat. Conversations are saved to
 * the admin's account (see AssistantProvider).
 */
export function AssistantChat({ turns, setTurns, compact }: { turns: Turn[]; setTurns: React.Dispatch<React.SetStateAction<Turn[]>>; compact?: boolean }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const saved = useAssistantChats();
  const router = useRouter();
  const [showHistory, setShowHistory] = useState(false);
  useEffect(() => {
    // Braces matter: newer browsers return a Promise from scrollIntoView, and
    // an effect must never return anything but a cleanup function.
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Turn[] = [...turns, { role: "admin", text: q }];
    setTurns(next);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ text: string; proposals: Proposal[]; lookups: string[]; open?: string | null }>("/api/v1/admin/assistant", {
        history: next.map((t) => ({ role: t.role, text: t.text })).slice(-30),
      });
      const open = r.open && /^\/admin(\/[a-z-]+)?(\?q=[^#\s]*)?$/.test(r.open) ? r.open : undefined;
      setTurns([...next, { role: "assistant", text: r.text, proposals: r.proposals.map((p) => ({ ...p, state: "idle" })), lookups: r.lookups, ...(open ? { open } : {}) }]);
      if (open) router.push(open);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The assistant couldn't answer. Try again.");
    }
    setBusy(false);
  }

  function setProposal(ti: number, pi: number, patch: Partial<Proposal>) {
    setTurns((all) => all.map((t, i) => (i === ti ? { ...t, proposals: t.proposals?.map((p, j) => (j === pi ? { ...p, ...patch } : p)) } : t)));
  }

  async function confirm(ti: number, pi: number, p: Proposal) {
    setProposal(ti, pi, { state: "busy" });
    try {
      const r = await api.put<{ result: string }>("/api/v1/admin/assistant", { token: p.token });
      setProposal(ti, pi, { state: "done", result: r.result });
    } catch (e) {
      setProposal(ti, pi, { state: "error", result: e instanceof ApiError ? e.message : "Couldn't do that." });
    }
  }

  return (
      <div className={cx("flex flex-col", compact ? "h-full min-h-0" : "admin-glass min-h-[60vh] rounded-xl border border-border")}>
        {saved && (
          <div className="relative flex items-center gap-1 border-b border-white/10 px-3 py-2 text-xs">
            <button type="button" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory} className="flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-muted-text hover:bg-white/5 hover:text-foreground">
              <History className="size-3.5" aria-hidden="true" /> History{saved.chats.length ? ` · ${saved.chats.length}` : ""}
            </button>
            <button type="button" onClick={() => { saved.newChat(); setShowHistory(false); setError(null); }} disabled={busy} className="ml-auto flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 font-medium text-primary hover:bg-primary/10 disabled:opacity-40">
              <Plus className="size-3.5" aria-hidden="true" /> New chat
            </button>
            {showHistory && (
              <div className="absolute inset-x-2 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-elevated/95 p-1 shadow-2xl backdrop-blur-xl">
                {saved.chats.length === 0 && <p className="px-3 py-4 text-center text-muted-text">No saved conversations yet.</p>}
                {saved.chats.map((c) => (
                  <div key={c.id} className={cx("group flex items-center gap-1 rounded-lg", c.id === saved.chatId && "bg-primary/10")}>
                    <button type="button" disabled={busy} onClick={() => { void saved.openChat(c.id).catch(() => setError("Couldn't open that conversation.")); setShowHistory(false); }} className="min-w-0 flex-1 px-3 py-2 text-left hover:text-primary">
                      <span className="block truncate text-foreground">{c.title || "Conversation"}</span>
                      <span className="text-[10px] text-muted-text">{new Date(c.updatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
                    </button>
                    <button type="button" aria-label="Delete conversation" onClick={() => void saved.removeChat(c.id)} className="rounded-md p-2 text-muted-text hover:bg-destructive/10 hover:text-destructive">
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className={cx("flex-1 space-y-4 overflow-y-auto", compact ? "min-h-0 p-3" : "p-4 sm:p-5")} aria-live="polite">
          {turns.length === 0 && (
            <div className="space-y-4 py-6 text-center">
              <Bot className="mx-auto size-10 text-primary" aria-hidden="true" />
              <p className="text-sm text-muted-text">Ask anything about Recktube, or tell me what to do.</p>
              <div className="flex flex-wrap justify-center gap-2">
                {STARTERS.map((s) => (
                  <button key={s} type="button" onClick={() => void ask(s)} className="min-h-9 rounded-full border border-border px-3 py-1.5 text-xs hover:bg-muted">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {turns.map((t, ti) => (
            <div key={ti} className={cx("flex", t.role === "admin" ? "justify-end" : "justify-start")}>
              <div className={cx("max-w-[92%] space-y-2 rounded-2xl px-4 py-3 text-sm", !compact && "sm:max-w-[80%]", t.role === "admin" ? "bg-primary text-primary-foreground" : "bg-muted/60")}>
                {!!t.lookups?.length && (
                  <p className="flex flex-wrap items-center gap-1 text-[11px] text-muted-text">
                    <Search className="size-3" aria-hidden="true" /> Checked: {[...new Set(t.lookups)].map((l) => LOOKUP_LABEL[l] ?? l).join(", ")}
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words">{t.text}</p>
                {t.open && (
                  <button type="button" onClick={() => router.push(t.open!)} className="inline-flex items-center gap-1 rounded-full border border-primary/40 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10">
                    Open {t.open.replace(/^\/admin\/?/, "").split("?")[0] || "overview"} →
                  </button>
                )}
                {t.proposals?.map((p, pi) => (
                  <div key={pi} className="rounded-xl border border-border bg-background/70 p-3">
                    <p className="flex items-start gap-2 text-sm">
                      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                      <span>{p.summary}</span>
                    </p>
                    {p.state === "done" && <p className="mt-2 flex items-center gap-1 text-xs text-success"><Check className="size-3.5" aria-hidden="true" /> {p.result}</p>}
                    {p.state === "error" && <p className="mt-2 text-xs text-destructive">{p.result}</p>}
                    {p.state === "dismissed" && <p className="mt-2 text-xs text-muted-text">Skipped.</p>}
                    {(p.state === "idle" || p.state === "busy" || p.state === "error") && (
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" loading={p.state === "busy"} onClick={() => void confirm(ti, pi, p)}>
                          <Check className="size-3.5" aria-hidden="true" /> Confirm
                        </Button>
                        <Button size="sm" variant="ghost" disabled={p.state === "busy"} onClick={() => setProposal(ti, pi, { state: "dismissed" })}>
                          <X className="size-3.5" aria-hidden="true" /> Skip
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {busy && (
            <p className="flex items-center gap-2 text-sm text-muted-text">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Looking into it…
            </p>
          )}
          {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <div ref={end} />
        </div>
        <form
          className="border-t border-white/10 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
        >
          <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-black/30 p-1.5 pl-4 shadow-inner transition focus-within:border-violet-400/60 focus-within:ring-2 focus-within:ring-violet-500/25">
            <textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void ask(input);
                }
              }}
              rows={1}
              maxLength={2000}
              aria-label="Ask the assistant"
              placeholder="Ask anything or tell me what to do…"
              className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2.5 text-sm leading-5 outline-none placeholder:text-muted-text"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send"
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-600 via-violet-600 to-sky-600 text-white shadow-lg shadow-violet-900/40 transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
            </button>
          </div>
          <p className="mt-1.5 px-1 text-[10px] text-muted-text">Enter to send · Shift+Enter for a new line · Nothing changes until you tap Confirm</p>
        </form>
      </div>
  );
}
