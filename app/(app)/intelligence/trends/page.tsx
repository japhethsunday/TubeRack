"use client";

import { Breadcrumb } from "@/src/components/ui/data";
import { TrendRadar } from "@/src/components/growth/TrendRadar";

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Breadcrumb trail={[{ label: "Content Intelligence", href: "/intelligence" }, { label: "Trend Radar" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Trend Radar</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-text">What&apos;s rising on YouTube this week in the topics you watch — ranked by views per hour, with a morning email digest.</p>
      </div>
      <TrendRadar />
    </div>
  );
}
