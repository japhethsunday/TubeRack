"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { refreshAdminData } from "@/src/components/admin/kit";
import {
  ArrowUp, BarChart3, Check, ChevronRight, Clapperboard, Coins, Gauge, Handshake, History, LifeBuoy, Mail, Megaphone, MessagesSquare,
  MinusCircle, Plus, Power, Send, ShieldAlert, Sparkles, Ticket, Trash2, TriangleAlert, UserCheck, UserPlus, UserX, Wallet, X,
  type LucideIcon,
} from "lucide-react";
import { useAssistantChats } from "@/src/components/admin/AssistantLauncher";
import { api, ApiError } from "@/src/lib/api";
import { cx } from "@/src/components/ui/cx";

export interface Proposal { action: string; summary: string; token: string; state?: "idle" | "busy" | "done" | "error" | "dismissed"; result?: string }
export interface Turn { role: "admin" | "assistant"; text: string; proposals?: Proposal[]; lookups?: string[]; open?: string; choices?: string[]; wrapFor?: number }

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

const ACTION_ICON: Record<string, LucideIcon> = {
  give_credits: Coins, remove_credits: MinusCircle, set_monthly_plan: Gauge, set_unlimited: Gauge, suspend_user: UserX, reactivate_user: UserCheck,
  send_email: Mail, email_everyone: Megaphone, reply_support: LifeBuoy, approve_affiliate: Handshake, create_bonus_code: Ticket,
  pause_tool: Power, resume_tool: Power, write_promo_videos: Clapperboard, make_and_post_videos: Clapperboard,
};
const TODO_ICON: Record<string, LucideIcon> = {
  "flags-high": ShieldAlert, flags: ShieldAlert, support: LifeBuoy, inbox: Mail, failures: TriangleAlert, promos: Clapperboard,
  affiliates: Handshake, owed: Wallet, paused: Power, sending: Send, signups: UserPlus,
};
const TONE = {
  urgent: { bar: "bg-rose-500", icon: "bg-rose-500/15 text-rose-300", label: "Now" },
  normal: { bar: "bg-amber-400", icon: "bg-amber-400/15 text-amber-200", label: "Today" },
  good: { bar: "bg-emerald-400", icon: "bg-emerald-400/15 text-emerald-200", label: "FYI" },
} as const;

/** One-tap starting points, shown as tiles. */
const QUICK: { label: string; ask: string; icon: LucideIcon }[] = [
  { label: "Today's priorities", ask: "Hi, what needs me today?", icon: Sparkles },
  { label: "Business this week", ask: "How is the business doing this week?", icon: BarChart3 },
  { label: "Make & post videos", ask: "Make and post 2 promo videos", icon: Clapperboard },
  { label: "Reply to support", ask: "Reply to all creators waiting for support", icon: LifeBuoy },
  { label: "Fraud check", ask: "Any suspicious accounts or fraud?", icon: ShieldAlert },
  { label: "What failed today", ask: "What failed in the last 24 hours?", icon: TriangleAlert },
];

function Orb({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span className={cx("relative flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 via-violet-600 to-sky-500 text-white shadow-lg shadow-violet-900/40", size === "sm" ? "size-7" : "size-9")}>
      <Sparkles className={size === "sm" ? "size-3.5" : "size-4"} aria-hidden="true" />
    </span>
  );
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
  upcoming_posts: "scheduled posts",
  bonus_codes: "bonus codes",
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
  youtube_channel: "YouTube channel",
  scheduled_emails: "scheduled emails",
  promo_videos: "promo videos",
};

/**
 * The admin assistant chat. Admin console only — it has its own endpoint and
 * shares nothing with the creators' support chat. Conversations are saved to
 * the admin's account (see AssistantProvider).
 */
export function AssistantChat({ turns, setTurns, compact, onNavigate }: { turns: Turn[]; setTurns: React.Dispatch<React.SetStateAction<Turn[]>>; compact?: boolean; onNavigate?: () => void }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const saved = useAssistantChats();
  const router = useRouter();
  const pathname = usePathname();
  /** Go to an admin page; when it's the page already open, reload it with fresh data. */
  /** Open an admin page. Only a tap closes the chat on phones; a reply opening a page keeps the chat up. */
  function go(href: string, tapped = true) {
    if (tapped) onNavigate?.();
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
      const r = await api.post<{ text: string; proposals: Proposal[]; lookups: string[]; open?: string | null; choices?: string[] }>("/api/v1/admin/assistant", {
        history: next.map((t) => ({ role: t.role, text: t.text })).slice(-30),
        page: pathname,
      });
      const open = r.open && /^\/admin(\/[a-z-]+)?(\?q=[^#\s]*)?$/.test(r.open) ? r.open : undefined;
      setTurns((all) => [...all, { role: "assistant", text: r.text, proposals: r.proposals.map((p) => ({ ...p, state: "idle" })), lookups: r.lookups, ...(open ? { open } : {}), ...(r.choices?.length ? { choices: r.choices } : {}) }]);
      if (open) go(open, false);
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

  /** Once every card in a reply is handled, the assistant closes the task with a short summary. */
  function wrapUp(ti: number) {
    setTurns((all) => {
      const t = all[ti];
      const cards = t?.proposals ?? [];
      if (!cards.length || ti !== all.length - 1 || cards.some((p) => p.state === "idle" || p.state === "busy")) return all;
      if (all.some((x) => x.wrapFor === ti)) return all;
      const done = cards.filter((p) => p.state === "done");
      const failed = cards.filter((p) => p.state === "error");
      const skipped = cards.filter((p) => p.state === "dismissed").length;
      if (!done.length && !failed.length) return all;
      let text =
        done.length === 1 && !failed.length
          ? `All done. ${done[0].result ?? ""}`.trim()
          : done.length
            ? `All done${failed.length ? " except one" : ""}, boss. Here is what changed:\n${done.map((p) => `• ${p.result ?? "Done."}`).join("\n")}`
            : "That did not go through.";
      if (failed.length) text += `\n\n${failed.length === 1 ? "This one did not work" : `${failed.length} did not work`}: ${failed.map((p) => p.result).filter(Boolean).join("; ")}. Tap Try again, or tell me what to change.`;
      if (skipped) text += `\n(${skipped} skipped, nothing changed there.)`;
      text += "\n\nAnything else I can take care of?";
      return [...all, { role: "assistant" as const, text, wrapFor: ti, choices: ["What else needs me today?", "That's all, thanks"] }];
    });
  }

  async function confirm(ti: number, pi: number, p: Proposal) {
    setProposal(ti, pi, { state: "busy" });
    try {
      const r = await api.put<{ result: string; launch?: string }>("/api/v1/admin/assistant", { token: p.token });
      setProposal(ti, pi, { state: "done", result: r.result });
      wrapUp(ti);
      // Pages behind the assistant show the change straight away.
      refreshAdminData();
      // Hands-free video posting continues in this tab (only our own admin page).
      if (r.launch && /^\/admin\/promo\/run\?ids=[0-9a-f%2C,-]+(&at=(now|morning|afternoon|evening))?(&start=\d{1,2})?(&pf=(yt|tt)(%2C|,)?(yt|tt)?)?$/.test(r.launch)) window.setTimeout(() => window.location.assign(r.launch!), 1200);
    } catch (e) {
      setProposal(ti, pi, { state: "error", result: e instanceof ApiError ? e.message : "Couldn't do that." });
      wrapUp(ti);
    }
  }

  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const boss = saved?.boss ?? null;
  const needs = boss?.todos.filter((t) => t.tone !== "good").length ?? 0;

  return (
    <div className={cx("assistant-ui flex flex-col text-[#ece9f5]", compact ? "h-full min-h-0 bg-[#0d0a16]" : "h-[calc(100dvh-12rem)] min-h-[520px] overflow-hidden rounded-3xl border border-white/10 bg-[#0d0a16] shadow-2xl shadow-black/40")}>
      {/* Toolbar: Chat / History and New */}
      {saved && (
        <div className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-2">
          <div className="flex rounded-full bg-white/[0.05] p-0.5 text-xs font-medium" role="tablist" aria-label="Assistant view">
            <button type="button" role="tab" aria-selected={!showHistory} onClick={() => setShowHistory(false)} className={cx("flex items-center gap-1.5 rounded-full px-3 py-1.5 transition", !showHistory ? "bg-white/10 text-white shadow-sm" : "text-white/55 hover:text-white")}>
              <MessagesSquare className="size-3.5" aria-hidden="true" /> Chat
            </button>
            <button type="button" role="tab" aria-selected={showHistory} onClick={() => setShowHistory(true)} className={cx("flex items-center gap-1.5 rounded-full px-3 py-1.5 transition", showHistory ? "bg-white/10 text-white shadow-sm" : "text-white/55 hover:text-white")}>
              <History className="size-3.5" aria-hidden="true" /> History{saved.chats.length ? <span className="rounded-full bg-white/10 px-1.5 text-[10px]">{saved.chats.length}</span> : null}
            </button>
          </div>
          <button type="button" onClick={() => { saved.newChat(); setShowHistory(false); setError(null); }} disabled={busy} className="ml-auto flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:border-violet-400/50 hover:bg-violet-500/10 hover:text-white disabled:opacity-40">
            <Plus className="size-3.5" aria-hidden="true" /> New chat
          </button>
        </div>
      )}

      {saved && showHistory ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {saved.chats.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-white/50">
              <History className="size-8 opacity-40" aria-hidden="true" /> No saved conversations yet.
            </div>
          ) : (
            <ul className="space-y-1">
              {saved.chats.map((c) => (
                <li key={c.id} className={cx("group flex items-center rounded-2xl border transition", c.id === saved.chatId ? "border-violet-400/30 bg-violet-500/10" : "border-transparent hover:bg-white/[0.04]")}>
                  <button type="button" disabled={busy} onClick={() => { void saved.openChat(c.id).catch(() => setError("Couldn't open that conversation.")); setShowHistory(false); }} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/70"><MessagesSquare className="size-4" aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-white/90">{c.title || "Conversation"}</span>
                      <span className="block text-[11px] text-white/45">{new Date(c.updatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
                    </span>
                  </button>
                  <button type="button" aria-label="Delete conversation" onClick={() => void saved.removeChat(c.id)} className="mr-2 rounded-lg p-2 text-white/35 opacity-100 sm:opacity-0 transition hover:bg-rose-500/10 hover:text-rose-300 focus:opacity-100 group-hover:opacity-100">
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (<>
      <div className={cx("min-h-0 flex-1 space-y-4 overflow-y-auto", compact ? "px-3 py-4" : "px-4 py-5 sm:px-6")} aria-live="polite">
        {turns.length === 0 && (
          <div className="support-in space-y-4">
            {/* Briefing card */}
            <div className="rounded-3xl bg-gradient-to-br from-fuchsia-500/40 via-violet-500/25 to-sky-500/40 p-px">
              <div className="rounded-[23px] bg-[#130e20] p-4">
                <div className="flex items-center gap-3">
                  <Orb />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-white/45">{today}</p>
                    <p className="truncate text-base font-semibold text-white">{boss ? `${greeting()}, ${boss.name}` : "How can I help today?"}</p>
                  </div>
                  {boss && (
                    <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", needs ? "bg-rose-500/15 text-rose-200" : "bg-emerald-500/15 text-emerald-200")}>
                      {needs ? `${needs} need${needs === 1 ? "s" : ""} you` : "All clear"}
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-white/65">
                  {boss
                    ? needs
                      ? "Here's what's waiting for you, most important first. Tap one to go straight there."
                      : "Nothing urgent. Here's today at a glance."
                    : "Ask about the business, look into an account or tell me what to do. Nothing changes until you confirm."}
                </p>
                {boss && boss.todos.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {boss.todos.map((t) => {
                      const Icon = TODO_ICON[t.id] ?? Sparkles;
                      const tone = TONE[t.tone];
                      return (
                        <li key={t.id}>
                          <button type="button" onClick={() => go(t.href)} className="group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.03] py-2.5 pl-4 pr-3 text-left transition hover:border-white/15 hover:bg-white/[0.06]">
                            <span className={cx("absolute inset-y-2 left-0 w-1 rounded-r-full", tone.bar)} aria-hidden="true" />
                            <span className={cx("flex size-8 shrink-0 items-center justify-center rounded-xl", tone.icon)}><Icon className="size-4" aria-hidden="true" /></span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium text-white/90">{t.title}</span>
                              <span className="block truncate text-[11px] text-white/45">{t.detail}</span>
                            </span>
                            <span className="hidden text-[10px] font-semibold uppercase tracking-wider text-white/35 sm:inline">{tone.label}</span>
                            <ChevronRight className="size-4 shrink-0 text-white/30 transition group-hover:translate-x-0.5 group-hover:text-white/70" aria-hidden="true" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
            {/* Quick actions */}
            <div>
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">Quick actions</p>
              <div className={cx("grid gap-2", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}>
                {QUICK.map((q) => (
                  <button key={q.label} type="button" onClick={() => void ask(q.ask)} className="group flex items-center gap-2.5 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 text-left text-xs font-medium text-white/80 transition hover:-translate-y-0.5 hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-white">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500/25 to-sky-500/25 text-violet-200 transition group-hover:from-fuchsia-500/40 group-hover:to-sky-500/40"><q.icon className="size-3.5" aria-hidden="true" /></span>
                    <span className="min-w-0 leading-snug">{q.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {turns.map((t, ti) =>
          t.role === "admin" ? (
            <div key={ti} className="support-in flex justify-end">
              <div className={cx("max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-violet-600 px-3.5 py-2.5 text-sm leading-relaxed text-white shadow-lg shadow-violet-950/40", !compact && "sm:max-w-[70%]")}>{t.text}</div>
            </div>
          ) : (
            <div key={ti} className="support-in flex items-start gap-2.5">
              <Orb size="sm" />
              <div className={cx("min-w-0 max-w-[88%] space-y-2.5", !compact && "sm:max-w-[80%]")}>
                {!!t.lookups?.length && (
                  <div className="flex flex-wrap gap-1">
                    {[...new Set(t.lookups)].map((l) => (
                      <span key={l} className="inline-flex items-center gap-1 rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium text-white/50">
                        <Check className="size-3 text-emerald-300" aria-hidden="true" /> {LOOKUP_LABEL[l] ?? l.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                )}
                <div className="whitespace-pre-wrap break-words rounded-2xl rounded-tl-md border border-white/[0.07] bg-white/[0.04] px-3.5 py-2.5 text-sm leading-relaxed text-white/90">{t.text}</div>
                {!!t.choices?.length && ti === turns.length - 1 && (
                  <div role="group" aria-label="Choose an answer" className="flex flex-wrap gap-2">
                    {t.choices.map((c) => (
                      <button key={c} type="button" disabled={busy} onClick={() => void ask(c)} className="rounded-full border border-violet-400/40 bg-violet-500/10 px-3.5 py-2 text-left text-xs font-semibold text-violet-100 transition hover:border-violet-300/70 hover:bg-violet-500/20 active:scale-[0.97] disabled:opacity-50">
                        {c}
                      </button>
                    ))}
                  </div>
                )}
                {t.open && (
                  <button type="button" onClick={() => go(t.open!)} className="inline-flex items-center gap-1 rounded-full border border-violet-400/40 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-100 transition hover:bg-violet-500/20">
                    Open {t.open.replace(/^\/admin\/?/, "").split("?")[0].replace(/-/g, " ") || "overview"} <ChevronRight className="size-3.5" aria-hidden="true" />
                  </button>
                )}
                {(t.proposals?.filter((p) => p.state === "idle" || p.state === "error").length ?? 0) >= 2 && (
                  <button type="button" onClick={() => void confirmAll(ti)} disabled={t.proposals?.some((p) => p.state === "busy")} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-fuchsia-600 via-violet-600 to-sky-600 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-950/40 transition hover:brightness-110 disabled:opacity-50">
                    <Check className="size-3.5" aria-hidden="true" /> Confirm all {t.proposals?.filter((p) => p.state === "idle" || p.state === "error").length}
                  </button>
                )}
                {t.proposals?.map((p, pi) => {
                  const Icon = ACTION_ICON[p.action] ?? Sparkles;
                  return (
                    <div key={pi} className={cx("rounded-2xl border p-3 transition", p.state === "done" ? "border-emerald-400/25 bg-emerald-500/[0.06]" : p.state === "dismissed" ? "border-white/[0.06] bg-transparent opacity-60" : p.state === "error" ? "border-rose-400/30 bg-rose-500/[0.06]" : "border-violet-400/25 bg-violet-500/[0.06]")}>
                      <div className="flex items-start gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.07] text-violet-200"><Icon className="size-4" aria-hidden="true" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">{p.state === "done" ? "Done" : p.state === "dismissed" ? "Skipped" : p.state === "error" ? "Didn't work" : "Needs your OK"}</p>
                          <p className="whitespace-pre-line text-sm leading-snug text-white/90">{p.summary}</p>
                        </div>
                      </div>
                      {p.state === "done" && <p className="mt-2 flex items-start gap-1.5 text-xs text-emerald-200"><Check className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> {p.result}</p>}
                      {p.state === "error" && <p className="mt-2 text-xs text-rose-200">{p.result}</p>}
                      {(p.state === "idle" || p.state === "busy" || p.state === "error") && (
                        <div className="mt-3 flex gap-2">
                          <button type="button" disabled={p.state === "busy"} onClick={() => void confirm(ti, pi, p)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-fuchsia-600 via-violet-600 to-sky-600 px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-60">
                            {p.state === "busy" ? <span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> : <Check className="size-3.5" aria-hidden="true" />} {p.state === "busy" ? "Working…" : p.state === "error" ? "Try again" : "Confirm"}
                          </button>
                          <button type="button" disabled={p.state === "busy"} onClick={() => { setProposal(ti, pi, { state: "dismissed" }); wrapUp(ti); }} className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-white/70 transition hover:bg-white/[0.06] disabled:opacity-40">
                            <X className="size-3.5" aria-hidden="true" /> Skip
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ),
        )}
        {busy && (
          <div className="flex items-center gap-2.5" aria-label="The assistant is working">
            <Orb size="sm" />
            <div className="flex items-center gap-2 rounded-2xl rounded-tl-md border border-white/[0.07] bg-white/[0.04] px-3.5 py-2.5 text-xs text-white/60">
              <span className="flex gap-1"><span className="support-dot" /><span className="support-dot" style={{ animationDelay: "0.15s" }} /><span className="support-dot" style={{ animationDelay: "0.3s" }} /></span>
              Working on it
            </div>
          </div>
        )}
        {error && <p role="alert" className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-200">{error}</p>}
        <div ref={end} />
      </div>

      {/* Composer */}
      <form
        className="border-t border-white/[0.07] p-3"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-1.5 pl-3.5 transition focus-within:border-violet-400/60 focus-within:bg-white/[0.06] focus-within:shadow-[0_0_0_4px_rgba(139,92,246,0.15)]">
          <textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
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
            placeholder={boss ? `Ask anything, ${boss.name}…` : "Ask or tell me what to do…"}
            className="max-h-36 min-h-10 flex-1 resize-none bg-transparent py-2.5 text-base leading-5 text-white outline-none placeholder:text-white/35 sm:text-sm"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-600 via-violet-600 to-sky-600 text-white shadow-lg shadow-violet-950/50 transition hover:brightness-110 disabled:opacity-30 disabled:shadow-none"
          >
            <ArrowUp className="size-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-1.5 px-1 text-center text-[10px] text-white/30">Enter to send · Shift+Enter for a new line · Nothing changes until you confirm</p>
      </form>
      </>)}
    </div>
  );
}
