"use client";

import { useEffect, useRef, useState } from "react";
import { Coins } from "lucide-react";
import { api } from "@/src/lib/api";
import { cx } from "@/src/components/ui/cx";

interface Credits { balance: number; monthlyGrant: number; unlimited: boolean; refilledAt: string | null; costs: Record<string, number> }

const COST_LABELS: [string, string][] = [["autovideo", "Full generated video"], ["text", "Ideas, scripts & titles"], ["research", "Research"], ["tts", "Voice-over"], ["transcription", "Transcription"], ["image", "Image"], ["video", "AI video clip"]];

/** Credits pill in the top bar, next to the profile, with a details popover. */
export function CreditsPill() {
  const [c, setC] = useState<Credits | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const load = () => void api.get<Credits>("/api/v1/credits/me").then((d) => alive && setC(d)).catch(() => {});
    load();
    const t = window.setInterval(load, 60_000);
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      window.clearInterval(t);
      window.removeEventListener("focus", load);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!c) return null;
  const pct = c.unlimited ? 100 : Math.min(100, Math.round((c.balance / Math.max(1, c.monthlyGrant)) * 100));
  const low = !c.unlimited && pct <= 10;
  const refill = c.refilledAt ? new Date(new Date(c.refilledAt).getTime() + 30 * 86_400_000).toLocaleDateString(undefined, { month: "long", day: "numeric" }) : null;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={c.unlimited ? "Credits: unlimited" : `Credits: ${c.balance} left`}
        className={cx(
          "flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold tabular-nums transition-colors",
          low ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-muted/50 hover:bg-muted",
        )}
      >
        <Coins className={cx("size-4", low ? "text-destructive" : "text-primary")} aria-hidden="true" />
        {c.unlimited ? "Unlimited" : c.balance.toLocaleString()}
        <span className="hidden font-normal text-muted-text lg:inline">credits</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Your credits" className="absolute right-0 top-11 z-50 w-72 max-sm:fixed max-sm:inset-x-4 max-sm:top-[calc(4rem+env(safe-area-inset-top))] max-sm:w-auto max-sm:max-h-[70vh] max-sm:overflow-y-auto rounded-xl border border-border bg-elevated p-4 shadow-xl">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold">Your credits</span>
            <span className={cx("text-2xl font-bold tabular-nums", low && "text-destructive")}>{c.unlimited ? "∞" : c.balance.toLocaleString()}</span>
          </div>
          {c.unlimited ? (
            <p className="mt-2 text-xs text-muted-text">Your account has unlimited credits — every tool is included, with nothing deducted.</p>
          ) : (
            <>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Credits left this month">
                <div className={cx("h-full rounded-full", low ? "bg-destructive" : "bg-primary")} style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-text">
                {c.balance.toLocaleString()} of {c.monthlyGrant.toLocaleString()} left this month{refill ? ` · refills on ${refill}` : ""}.
              </p>
              {low && <p className="mt-2 text-xs text-destructive">You&apos;re running low. Generation pauses at zero until your monthly refill.</p>}
            </>
          )}
          <div className="mt-4 border-t border-border pt-3">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-text">{c.unlimited ? "Included in your plan" : "Cost per generation"}</div>
            <ul className="space-y-1 text-xs">
              {COST_LABELS.map(([k, label]) => (
                <li key={k} className="flex justify-between">
                  <span className="text-muted-text">{label}</span>
                  {c.unlimited ? <span className="font-medium text-success">Unlimited</span> : <span className="font-medium tabular-nums">{c.costs[k] ?? 1}</span>}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-muted-text">{c.unlimited ? "Use every tool as often as you like — no credits are taken." : "Credits are only used when a generation succeeds."}</p>
          </div>
          {!c.unlimited && (
            <a href="/redeem" className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/50 py-2 text-xs font-semibold text-primary hover:bg-primary/10">
              🎁 Have a bonus code? Redeem it
            </a>
          )}
        </div>
      )}
    </div>
  );
}
