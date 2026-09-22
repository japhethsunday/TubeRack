import Link from "next/link";
import { Container } from "@/src/components/ui/Container";

export default function NotFound() {
  return (
    <main id="main">
      <Container className="py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          404
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-zinc-600">
          This route does not exist in Phase 1. Product studios arrive in later
          phases.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Back to foundation
        </Link>
      </Container>
    </main>
  );
}
