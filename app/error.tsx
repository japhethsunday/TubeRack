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
    // Phase 12 wires this to real observability; console keeps it honest until then.
    console.error("Route error:", error);
  }, [error]);

  return (
    <main id="main">
      <Container className="py-14">
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-2 max-w-prose text-sm text-muted-text">
          This page hit a problem while loading. Your work is saved — try
          again, or go back to the dashboard.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-muted"
          >
            Go to dashboard
          </Link>
        </div>
      </Container>
    </main>
  );
}
