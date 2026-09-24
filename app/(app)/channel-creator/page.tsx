"use client";

import { Suspense } from "react";
import { Breadcrumb } from "@/src/components/ui/data";
import { ChannelCreator } from "@/src/components/channel/ChannelCreator";

export default function ChannelCreatorPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <Breadcrumb trail={[{ label: "Most Paying Niches", href: "/intelligence/paying-niches" }, { label: "Channel Creator" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Channel Creator</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-text">Build a channel strategy from live market and competitor data, then set it up on YouTube and start your first videos.</p>
      </div>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}>
        <ChannelCreator />
      </Suspense>
    </div>
  );
}
