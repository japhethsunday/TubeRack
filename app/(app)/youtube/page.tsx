"use client";

import { Suspense } from "react";
import { LoadingState } from "@/src/components/ui/feedback";
import { Breadcrumb } from "@/src/components/ui/data";
import { ChannelHub } from "@/src/components/growth/ChannelHub";

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Breadcrumb trail={[{ label: "Dashboard", href: "/dashboard" }, { label: "My Channel" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">My Channel</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-text">Your private YouTube Analytics, your uploads, and direct upload and scheduling — all from your connected channel.</p>
      </div>
      <Suspense fallback={<LoadingState label="Loading My Channel" />}>
        <ChannelHub />
      </Suspense>
    </div>
  );
}
