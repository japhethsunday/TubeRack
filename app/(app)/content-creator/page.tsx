"use client";

import { Breadcrumb } from "@/src/components/ui/data";
import { ContentCreator } from "@/src/components/content/ContentCreator";

export default function ContentCreatorPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <Breadcrumb trail={[{ label: "Intelligence", href: "/intelligence" }, { label: "Content Creator" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Content Creator</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-text">
          Studies your channel and what&apos;s winning in your niche on YouTube right now, then writes video ideas that build on proven demand — each one backed by the videos behind it.
        </p>
      </div>
      <ContentCreator />
    </div>
  );
}
