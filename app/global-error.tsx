"use client";

import { Container } from "@/src/components/ui/Container";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground">
        <main id="main">
          <Container className="py-14">
            <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
            <p className="mt-2 max-w-prose text-sm text-muted-text">
              TubeRack hit a problem. Your work is saved — reload the page to continue.
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-6 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Retry
            </button>
          </Container>
        </main>
      </body>
    </html>
  );
}
