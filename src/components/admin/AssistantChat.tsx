"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Check, Loader2, Search, Send, ShieldCheck, X } from "lucide-react";
import { api, ApiError } from "@/src/lib/api";
import { Button } from "@/src/components/ui/Button";
import { cx } from "@/src/components/ui/cx";

export interface Proposal { action: string; summary: string; token: string; state?: "idle" | "busy" | "done" | "error" | "dismissed"; result?: string }
export interface Turn { role: "admin" | "assistant"; text: string; proposals?: Proposal[]; lookups?: string[] }

const STARTERS = [
  "How is the business doing this week?",
  "Any suspicious accounts or fraud?",
  "What failed in the last 24 hours?",
  "Who is waiting for support?",
  "Where are new sign-ups coming from?",
];

const LOOKUP_LABEL: Record<string, string> = {
  business_overview: "business numbers",
  find_users: "accounts",
  user_details: "account details",
  recent_failures: "failures",
  support_queue: "support queue",
  growth_report: "sign-up sources",
  affiliates_overview: "affiliates",
  safety_flags: "safety flags",
  tool_switches: "tool switches",
};

/**
 * The admin assistant chat. Admin console only — it has its own endpoint and
 * shares nothing with the creators' support chat. The conversation lives in
 * memory for this session only (never saved in the browser).
 */
export function AssistantChat({ turns, setTurns, compact }: { turns: Turn[]; setTurns: React.Dispatch<React.SetStateAction<Turn[]>>; compact?: boolean }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
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
      const r = await api.post<{ text: string; proposals: Proposal[]; lookups: string[] }>("/api/v1/admin/assistant", {
        history: next.map((t) => ({ role: t.role, text: t.text })).slice(-30),
      });
      setTurns([...next, { role: "assistant", text: r.text, proposals: r.proposals.map((p) => ({ ...p, state: "idle" })), lookups: r.lookups }]);
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
          className="flex items-end gap-2 border-t border-border p-3"
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
            placeholder="e.g. Give ada@example.com 200 credits for the bug she reported"
            className="max-h-40 min-h-11 flex-1 resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
          />
          <Button type="submit" className="h-11" disabled={busy || !input.trim()} aria-label="Send">
            <Send className="size-4" aria-hidden="true" />
          </Button>
        </form>
      </div>
  );
}
