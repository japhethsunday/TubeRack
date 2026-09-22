import Link from "next/link";
import { Container } from "@/src/components/ui/Container";
import { Card } from "@/src/components/ui/Card";
import { StatusBadge } from "@/src/components/ui/StatusBadge";
import { allStages } from "@/src/lib/project/lifecycle";
import { allStatuses } from "@/src/lib/jobs/machine";

/**
 * Phase 1 landing: honest foundation status only.
 * No product features are claimed; every CTA points at a real route.
 */
export default function HomePage() {
  return (
    <main id="main">
      <Container className="py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          TubeRack · Phase 1 — Foundation
        </p>
        <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-tight tracking-tight">
          AI video production operating system, built on a solid foundation.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600">
          Idea → research → strategy → script → storyboard → visuals → voice →
          music → video → thumbnail → SEO → repurposing → publishing →
          analytics → improvement. Phase 1 establishes the architecture,
          contracts, and quality gates. Product studios arrive in later phases.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <StatusBadge tone="ok">Implemented: foundation</StatusBadge>
          <StatusBadge tone="pending">
            Awaiting integration: AI providers · DB · workers
          </StatusBadge>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/api/health"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          >
            Check API health
          </Link>
          <Link
            href="/api/version"
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:border-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          >
            View version
          </Link>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <Card
            title="Lifecycle contract"
            body="Single ordered pipeline every project follows. Later phases attach real tooling to each stage."
          >
            <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Project stages">
              {allStages().map((s) => (
                <li
                  key={s}
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-700"
                >
                  {s}
                </li>
              ))}
            </ol>
          </Card>
          <Card
            title="Recoverable jobs"
            body="Queued → processing → completed / failed / cancelled / retrying. Renders never restart from scratch."
          >
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Job statuses">
              {allStatuses().map((s) => (
                <li
                  key={s}
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-700"
                >
                  {s}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <p className="mt-8 text-sm text-zinc-500">
          Status detail: <span className="font-medium text-zinc-700">docs/PHASE_1.md</span> ·
          boundaries: <span className="font-medium text-zinc-700">docs/INTEGRATION_BOUNDARIES.md</span>
        </p>
      </Container>
    </main>
  );
}
