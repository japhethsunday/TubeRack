"use client";

import { useEffect, useState } from "react";
import { Coins } from "lucide-react";
import { api } from "@/src/lib/api";
import { cx } from "@/src/components/ui/cx";

interface Credits { balance: number; monthlyGrant: number; unlimited: boolean; refilledAt: string | null }

/** The signed-in user's credits, pinned to the bottom of the sidebar. */
export function CreditsCard({ collapsed = false }: { collapsed?: boolean }) {
  const [c, setC] = useState<Credits | null>(null);
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
  if (!c) return null;
  const pct = c.unlimited ? 100 : Math.min(100, Math.round((c.balance / Math.max(1, c.monthlyGrant)) * 100));
  const low = !c.unlimited && pct <= 10;
  const refill = c.refilledAt ? new Date(new Date(c.refilledAt).getTime() + 30 * 86_400_000).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;
  const value = c.unlimited ? "Unlimited" : c.balance.toLocaleString();

  if (collapsed)
    return (
      <div className="flex flex-col items-center gap-0.5 border-t border-border py-3 text-[10px] font-semibold" title={`${value} credits`}>
        <Coins className={cx("size-4", low ? "text-destructive" : "text-primary")} aria-hidden="true" />
        <span className={cx("tabular-nums", low && "text-destructive")}>{c.unlimited ? "∞" : c.balance}</span>
      </div>
    );
  return (
    <div className="border-t border-border p-3">
      <div className="rounded-xl border border-border bg-background/60 p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-semibold"><Coins className="size-4 text-primary" aria-hidden="true" /> Credits</span>
          <span className={cx("font-bold tabular-nums", low && "text-destructive")}>{value}</span>
        </div>
        {!c.unlimited && (
          <>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Credits left this month">
              <div className={cx("h-full rounded-full", low ? "bg-destructive" : "bg-primary")} style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1.5 text-[11px] text-muted-text">
              {c.balance.toLocaleString()} of {c.monthlyGrant.toLocaleString()} left{refill ? ` · refills ${refill}` : ""}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
