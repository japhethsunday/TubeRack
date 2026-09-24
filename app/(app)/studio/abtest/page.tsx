"use client";

import { Breadcrumb } from "@/src/components/ui/data";
import { AbTester } from "@/src/components/growth/AbTester";

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Breadcrumb trail={[{ label: "Dashboard", href: "/dashboard" }, { label: "Thumbnail A/B Tests" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Thumbnail A/B Tests</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-text">Rotate thumbnails on a live video, measure them with YouTube Analytics, and keep the winner automatically.</p>
      </div>
      <AbTester />
    </div>
  );
}
