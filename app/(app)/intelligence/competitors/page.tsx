"use client";

import { Breadcrumb } from "@/src/components/ui/data";
import { CompetitorTracker } from "@/src/components/growth/CompetitorTracker";

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Breadcrumb trail={[{ label: "Content Intelligence", href: "/intelligence" }, { label: "Competitor Tracker" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Competitor Tracker</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-text">Follow channels in your niche. See their breakout videos, upload cadence, and the title patterns that work — with alerts when something takes off.</p>
      </div>
      <CompetitorTracker />
    </div>
  );
}
