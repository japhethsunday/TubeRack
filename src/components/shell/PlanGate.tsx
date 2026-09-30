"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, Lock } from "lucide-react";
import { atLeast, featureForPath, FEATURES, TIER_NAME } from "@/src/lib/plans";
import { usePlan } from "@/src/lib/use-plan";

/** Shows an upgrade screen instead of a page the user's plan doesn't include. */
export function PlanGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const feature = featureForPath(pathname);
  const tier = usePlan();
  if (!feature || tier === null || atLeast(tier, FEATURES[feature].tier)) return <>{children}</>;
  const need = FEATURES[feature].tier;
  const perks = Object.values(FEATURES).filter((f) => f.tier === need).map((f) => f.label);
  return (
    <div className="mx-auto max-w-lg py-10 text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500/20 to-sky-500/20 text-violet-700 dark:text-violet-300">
        <Lock className="size-6" aria-hidden="true" />
      </span>
      <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-violet-700 dark:text-violet-300">{TIER_NAME[need]} plan</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">{FEATURES[feature].label} is part of {TIER_NAME[need]}</h1>
      <p className="mt-2 text-sm text-muted-text">You&apos;re on the {TIER_NAME[tier]} plan. Upgrade to unlock it, along with:</p>
      <ul className="mx-auto mt-5 max-w-xs space-y-2 text-left text-sm">
        {perks.map((p) => (
          <li key={p} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden="true" />{p}</li>
        ))}
      </ul>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link href="/pricing" className="inline-flex h-11 items-center rounded-xl bg-gradient-to-r from-fuchsia-600 via-violet-600 to-sky-600 px-5 text-sm font-semibold text-white transition hover:brightness-110">See plans</Link>
        <Link href="/dashboard" className="inline-flex h-11 items-center rounded-xl border border-border px-5 text-sm font-semibold transition hover:bg-muted">Back to dashboard</Link>
      </div>
    </div>
  );
}

/** Small plan badge for locked items in menus. */
export function PlanBadge({ href }: { href: string }) {
  const tier = usePlan();
  const feature = featureForPath(href.split("?")[0]);
  if (!feature || tier === null || atLeast(tier, FEATURES[feature].tier)) return null;
  return <span className="rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">{TIER_NAME[FEATURES[feature].tier]}</span>;
}
