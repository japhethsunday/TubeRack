"use client";

import { Breadcrumb } from "@/src/components/ui/data";
import { PayingNiches } from "@/src/components/market/PayingNiches";

export default function PayingNichesPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <Breadcrumb trail={[{ label: "Content Intelligence", href: "/intelligence" }, { label: "Most Paying Niches" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Most Paying Niches</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-text">Niches ranked by earning potential, demand, competition and growth, measured from live YouTube data per country.</p>
      </div>
      <PayingNiches />
    </div>
  );
}
