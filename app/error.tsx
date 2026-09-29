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
    console.error("Route error:", error);
    const message = String(error?.message ?? error);
    // A page left open during a deploy can't load the new version's files: reload once to pick them up.
    if (/ChunkLoadError|Loading chunk|dynamically imported module|Failed to fetch dynamically|importing a module script failed/i.test(message)) {
      try {
        if (!sessionStorage.getItem("rt_reloaded_for_deploy")) {
          sessionStorage.setItem("rt_reloaded_for_deploy", "1");
          window.location.reload();
          return;
        }
      } catch {
        // storage blocked: just show the page
      }
    }
    // Report it so the team can see what actually broke (message and place only, no personal data).
    void fetch("/api/v1/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message.slice(0, 500), digest: error?.digest ?? "", path: window.location.pathname, stack: String(error?.stack ?? "").slice(0, 2000) }),
      keepalive: true,
    }).catch(() => undefined);
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
            className="inline-flex h-10 items-center rounded-lg bg-gradient-to-r from-fuchsia-600 via-violet-600 to-sky-600 px-4 text-sm font-medium text-white hover:opacity-90"
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
