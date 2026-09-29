"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { refreshAdminData } from "@/src/components/admin/kit";
import { ArrowLeft, Bot, Check, History, MessageSquarePlus, Plus, Search, Send, ShieldCheck, Trash2, X } from "lucide-react";
import { useAssistantChats } from "@/src/components/admin/AssistantLauncher";
import { api, ApiError } from "@/src/lib/api";
import { Button } from "@/src/components/ui/Button";
import { cx } from "@/src/components/ui/cx";

export interface Proposal { action: string; summary: string; token: string; state?: "idle" | "busy" | "done" | "error" | "dismissed"; result?: string }
export interface Turn { role: "admin" | "assistant"; text: string; proposals?: Proposal[]; lookups?: string[]; open?: string }

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

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
  boss_todo: "your to-dos",
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
  const pathname = usePathname();
  /** Go to an admin page; when it's the page already open, reload it with fresh data. */
  function go(href: string) {
    const [path, query = ""] = href.split("?");
    if (path === pathname) {
      if (query && `?${query}` !== window.location.search) window.location.assign(href);
      else refreshAdminData();
      return;
    }
    router.push(href);
  }
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
        page: pathname,
      });
      const open = r.open && /^\/admin(\/[a-z-]+)?(\?q=[^#\s]*)?$/.test(r.open) ? r.open : undefined;
      setTurns((all) => [...all, { role: "assistant", text: r.text, proposals: r.proposals.map((p) => ({ ...p, state: "idle" })), lookups: r.lookups, ...(open ? { open } : {}) }]);
      if (open) go(open);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The assistant couldn't answer. Try again.");
    }
    setBusy(false);
  }

  async function confirmAll(ti: number) {
    const list = turns[ti]?.proposals ?? [];
    // One after another, so each is re-checked and logged like a single Confirm.
    for (let pi = 0; pi < list.length; pi++) {
      const p = list[pi];
      if (p.state === "idle" || p.state === "error") await confirm(ti, pi, p);
    }
  }

  function setProposal(ti: number, pi: number, patch: Partial<Proposal>) {
    setTurns((all) => all.map((t, i) => (i === ti ? { ...t, proposals: t.proposals?.map((p, j) => (j === pi ? { ...p, ...patch } : p)) } : t)));
  }

  async function confirm(ti: number, pi: number, p: Proposal) {
    setProposal(ti, pi, { state: "busy" });
    try {
      const r = await api.put<{ result: string }>("/api/v1/admin/assistant", { token: p.token });
      setProposal(ti, pi, { state: "done", result: r.result });
      // Pages behind the assistant show the change straight away.
      refreshAdminData();
    } catch (e) {
      setProposal(ti, pi, { state: "error", result: e instanceof ApiError ? e.message : "Couldn't do that." });
    }
  }

  return (
      <div className={cx("flex flex-col", compact ? "h-full min-h-0" : "h-[calc(100dvh-12rem)] min-h-[480px] overflow-hidden rounded-2xl border border-border bg-elevated shadow-2xl shadow-black/30")}>
        {saved && !showHistory && (
          <div className="flex items-center gap-1 border-b border-border px-3 py-1.5 text-xs">
            <button type="button" onClick={() => setShowHistory(true)} className="flex min-h-8 items-center gap-1.5 rounded-full px-2.5 text-muted-text hover:bg-muted hover:text-foreground">
              <History className="size-3.5" aria-hidden="true" /> All conversations{saved.chats.length ? ` · ${saved.chats.length}` : ""}
            </button>
            <button type="button" onClick={() => { saved.newChat(); setError(null); }} disabled={busy} className="ml-auto flex min-h-8 items-center gap-1.5 rounded-full px-2.5 font-medium text-primary hover:bg-primary/10 disabled:opacity-40">
              <Plus className="size-3.5" aria-hidden="true" /> New
            </button>
          </div>
        )}
        {saved && showHistory ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <button type="button" onClick={() => setShowHistory(false)} className="mb-2 flex items-center gap-1.5 rounded-md px-1 py-1 text-xs text-muted-text hover:text-foreground">
              <ArrowLeft className="size-3.5" aria-hidden="true" /> Back to chat
            </button>
            <button type="button" onClick={() => { saved.newChat(); setShowHistory(false); setError(null); }} className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/50 py-2.5 text-sm font-medium text-primary hover:bg-primary/5">
              <MessageSquarePlus className="size-4" aria-hidden="true" /> New conversation
            </button>
            {saved.chats.length === 0 && <p className="py-6 text-center text-sm text-muted-text">No saved conversations yet.</p>}
            <ul className="space-y-1.5">
              {saved.chats.map((c) => (
                <li key={c.id} className={cx("group flex items-center rounded-xl hover:bg-muted", c.id === saved.chatId && "bg-muted")}>
                  <button type="button" disabled={busy} onClick={() => { void saved.openChat(c.id).catch(() => setError("Couldn't open that conversation.")); setShowHistory(false); }} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left">
                    <span className={cx("size-2 shrink-0 rounded-full", c.id === saved.chatId ? "bg-emerald-400" : "bg-sky-400")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{c.title || "Conversation"}</span>
                      <span className="block text-[11px] text-muted-text">{new Date(c.updatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
                    </span>
                  </button>
                  <button type="button" aria-label="Delete conversation" onClick={() => void saved.removeChat(c.id)} className="mr-1 rounded-md p-2 text-muted-text hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (<>
        <div className={cx("min-h-0 flex-1 space-y-3 overflow-y-auto", compact ? "p-4" : "p-4 sm:p-5")} aria-live="polite">
          {turns.length === 0 && saved?.boss && (
            <div className="support-in space-y-3">
              <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5 text-sm leading-relaxed">
                <p className="font-medium">{greeting()}, {saved.boss.name}.</p>
                <p className="mt-1 text-muted-text">{saved.boss.todos.some((t) => t.tone !== "good") ? "Here's what needs you right now:" : "Everything is under control. Here's today at a glance:"}</p>
              </div>
              {saved.boss.todos.length > 0 && (
                <ul className="space-y-1.5">
                  {saved.boss.todos.map((t) => (
                    <li key={t.id}>
                      <button type="button" onClick={() => go(t.href)} className="flex w-full items-start gap-2.5 rounded-xl border border-border px-3 py-2 text-left hover:border-primary">
                        <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", t.tone === "urgent" ? "bg-destructive" : t.tone === "good" ? "bg-emerald-400" : "bg-amber-400")} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{t.title}</span>
                          <span className="block text-[11px] text-muted-text">{t.detail}</span>
                        </span>
                        <span className="mt-0.5 text-xs font-medium text-primary">Open →</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-1.5">
                {["Hi, what needs me today?", ...STARTERS.slice(0, 3)].map((s) => (
                  <button key={s} type="button" onClick={() => void ask(s)} className="rounded-full border border-border px-3 py-1.5 text-xs hover:border-primary hover:text-primary">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {turns.length === 0 && !saved?.boss && (
            <div className="support-in space-y-3">
              <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5 text-sm leading-relaxed">
                <p className="font-medium">Hello, welcome to the Recktube admin assistant.</p>
                <p className="mt-1 text-muted-text">Ask anything about the business, look into an account, or tell me what to do. Nothing changes until you tap Confirm.</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {STARTERS.map((s) => (
                  <button key={s} type="button" onClick={() => void ask(s)} className="rounded-full border border-border px-3 py-1.5 text-xs hover:border-primary hover:text-primary">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {turns.map((t, ti) => (
            <div key={ti} className={cx("support-in flex", t.role === "admin" ? "justify-end" : "justify-start")}>
              <div className={cx("max-w-[85%] space-y-2 rounded-2xl px-3.5 py-2 text-sm leading-relaxed", !compact && "sm:max-w-[75%]", t.role === "admin" ? "rounded-br-md bg-gradient-to-br from-fuchsia-600 via-violet-600 to-sky-600 text-white" : "rounded-bl-md bg-muted")}>
                {!!t.lookups?.length && (
                  <p className="flex flex-wrap items-center gap-1 text-[11px] text-muted-text">
                    <Search className="size-3" aria-hidden="true" /> Checked: {[...new Set(t.lookups)].map((l) => LOOKUP_LABEL[l] ?? l).join(", ")}
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words">{t.text}</p>
                {t.open && (
                  <button type="button" onClick={() => go(t.open!)} className="inline-flex items-center gap-1 rounded-full border border-primary/40 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10">
                    Open {t.open.replace(/^\/admin\/?/, "").split("?")[0] || "overview"} →
                  </button>
                )}
                {(t.proposals?.filter((p) => p.state === "idle" || p.state === "error").length ?? 0) >= 2 && (
                  <Button size="sm" onClick={() => void confirmAll(ti)} disabled={t.proposals?.some((p) => p.state === "busy")}>
                    <Check className="size-3.5" aria-hidden="true" /> Confirm all {t.proposals?.filter((p) => p.state === "idle" || p.state === "error").length}
                  </Button>
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
            <div className="flex items-center gap-1 px-1" aria-label="The assistant is working">
              <span className="support-dot" /><span className="support-dot" style={{ animationDelay: "0.15s" }} /><span className="support-dot" style={{ animationDelay: "0.3s" }} />
            </div>
          )}
          {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <div ref={end} />
        </div>
        <form
          className="flex items-end gap-2 border-t border-border p-3"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(input);
              }
            }}
            rows={1}
            maxLength={2000}
            aria-label="Ask the assistant"
            placeholder="Ask or tell me what to do…"
            className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-base sm:text-sm"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="flex size-[42px] shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-600 via-violet-600 to-sky-600 text-white disabled:opacity-40"
          >
            <Send className="size-4" aria-hidden="true" />
          </button>
        </form>
        </>)}
      </div>
  );
}
