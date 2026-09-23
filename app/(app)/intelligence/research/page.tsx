"use client";

import { Breadcrumb } from "@/src/components/ui/data";
import { YouTubeResearch } from "@/src/components/intelligence/YouTubeResearch";

export default function ResearchPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <Breadcrumb trail={[{ label: "Content Intelligence", href: "/intelligence" }, { label: "YouTube research" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">YouTube research</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-text">
          Search live YouTube results for any topic: real titles, channels, and public view counts.
          Use what you find in the Gaps, Titles, and Hooks studios.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-surface p-5">
        <YouTubeResearch />
      </div>
    </div>
  );
}
