"use client";

import { StorageLibrary } from "@/src/components/storage/StorageLibrary";

export default function StoragePage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Storage</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-text">
          Everything you&apos;ve generated or uploaded, from every project — images, voice-overs, music, videos, thumbnails and scripts. Download anything, or add it to another project.
        </p>
      </div>
      <StorageLibrary />
    </div>
  );
}
