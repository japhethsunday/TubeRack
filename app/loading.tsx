import { Container } from "@/src/components/ui/Container";

export default function Loading() {
  return (
    <main id="main" aria-busy="true" aria-label="Loading">
      <Container className="py-14">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-8 w-2/3 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-4 w-1/2 animate-pulse rounded bg-muted" />
        <p className="mt-6 text-sm text-muted-text">Loading TubeRack…</p>
      </Container>
    </main>
  );
}
