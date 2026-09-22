"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Container } from "@/src/components/ui/Container";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Phase 12 wires this to real observability; console keeps Phase 1 honest.
    console.error("Route error:", error);
  }, [error]);

  return (
    <main id="main">
      <Container className="py-14">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-2 max-w-prose text-sm text-zinc-600">
          The foundation caught this error instead of crashing. You can retry the
          segment or return home.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Retry
          </button>
          <Link
            href="/"
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:border-zinc-400"
          >
            Go home
          </Link>
        </div>
      </Container>
    </main>
  );
}
