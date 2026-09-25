"use client";

import { Breadcrumb } from "@/src/components/ui/data";
import { VideoRecreator } from "@/src/components/content/VideoRecreator";

export default function VideoRecreatorPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <Breadcrumb trail={[{ label: "Intelligence", href: "/intelligence" }, { label: "Video Recreator" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Video Recreator</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-text">
          Finds the videos breaking out in your niche — views far beyond their channel&apos;s size — shows exactly why they work, and turns one into an original, better video plan with a full script draft.
        </p>
      </div>
      <VideoRecreator />
    </div>
  );
}
