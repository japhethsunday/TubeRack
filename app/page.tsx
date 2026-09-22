import Link from "next/link";
import { ArrowRight, LayoutDashboard, Palette } from "lucide-react";
import { Container } from "@/src/components/ui/Container";
import { Card } from "@/src/components/ui/Card";
import { StatusBadge } from "@/src/components/ui/StatusBadge";
import { Badge } from "@/src/components/ui/Badge";
import { allStages } from "@/src/lib/project/lifecycle";
import { allStatuses } from "@/src/lib/jobs/machine";

/** Marketing/foundation home: honest status + real entry points. */
export default function HomePage() {
  return (
    <main id="main">
      <Container className="py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-text">
          TubeRack · Phase 2 — Design foundation
        </p>
        <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          AI video production operating system, designed like one.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-text">
          Idea → research → strategy → script → storyboard → visuals → voice →
          music → video → thumbnail → SEO → repurposing → publishing →
          analytics → improvement. Phase 2 delivers the reusable design system
          and app shell every studio will be built on.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <StatusBadge tone="ok">Implemented: foundation + design system</StatusBadge>
          <StatusBadge tone="pending">
            Awaiting integration: AI providers · DB · workers
          </StatusBadge>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <LayoutDashboard className="size-4" aria-hidden="true" />
            Open dashboard
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link
            href="/design"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-muted"
          >
            <Palette className="size-4" aria-hidden="true" />
            Design system
          </Link>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <Card
            title="Lifecycle contract"
            body="Single ordered pipeline every project follows. Later phases attach real tooling to each stage."
          >
            <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Project stages">
              {allStages().map((s) => (
                <li key={s}>
                  <Badge tone="neutral">{s}</Badge>
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
                <li key={s}>
                  <Badge tone="neutral">{s}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <p className="mt-8 text-sm text-muted-text">
          Status detail: <span className="font-medium text-foreground">docs/PHASE_2.md</span> ·
          boundaries:{" "}
          <span className="font-medium text-foreground">docs/INTEGRATION_BOUNDARIES.md</span>
        </p>
      </Container>
    </main>
  );
}
