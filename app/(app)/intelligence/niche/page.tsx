"use client";

import { Breadcrumb } from "@/src/components/ui/data";
import { NicheFinder } from "@/src/components/intelligence/NicheFinder";

export default function NichePage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <Breadcrumb trail={[{ label: "Content Intelligence", href: "/intelligence" }, { label: "Niche Finder" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Niche Finder</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-text">
          Turn an interest into ranked YouTube niches. Gemini proposes sub-niches; live YouTube data scores each on demand,
          competition, and whether small channels are breaking through. Deep-dive any niche for a launch plan.
        </p>
      </div>
      <NicheFinder />
    </div>
  );
}
