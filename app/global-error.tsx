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
      <body className="min-h-screen bg-zinc-50 text-zinc-900">
        <main id="main">
          <Container className="py-14">
            <h1 className="text-2xl font-semibold">Application error</h1>
            <p className="mt-2 text-sm text-zinc-600">
              A critical error occurred. Reload or retry.
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-6 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
            >
              Retry
            </button>
          </Container>
        </main>
      </body>
    </html>
  );
}
