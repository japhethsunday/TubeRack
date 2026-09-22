import Link from "next/link";
import { FolderKanban, FlaskConical, PenLine, Clapperboard, Gauge } from "lucide-react";
import { NewProjectButton } from "@/src/components/patterns/NewProjectDialog";
import { EmptyState } from "@/src/components/ui/states";
import { Card } from "@/src/components/ui/Card";
import { Badge } from "@/src/components/ui/Badge";

const QUICK_ACTIONS = [
  {
    href: "/projects/preview?stage=research",
    icon: FlaskConical,
    label: "Research topic",
    blurb: "Sources & evidence",
  },
  {
    href: "/projects/preview?stage=script",
    icon: PenLine,
    label: "Open Script Studio",
    blurb: "Hooks & retention",
  },
  {
    href: "/projects/preview?stage=video",
    icon: Clapperboard,
    label: "Open Video Studio",
    blurb: "Timeline & render",
  },
];

/** Creator dashboard (visual foundation): real navigation, honest empty states. */
export default function DashboardPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-text">
            Preview workspace
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Good evening, creator
          </h1>
          <p className="mt-1 text-sm text-muted-text">
            Your next video starts here. Pick up where you left off or start
            something new.
          </p>
        </div>
        <NewProjectButton />
      </div>

      <section aria-label="Quick actions">
        <ul className="grid gap-3 sm:grid-cols-3">
          {QUICK_ACTIONS.map((a) => (
            <li key={a.label}>
              <Link
                href={a.href}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-colors duration-150 hover:border-muted-text/50 hover:bg-muted/40"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <a.icon className="size-5 text-muted-text" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-medium">{a.label}</span>
                  <span className="block text-xs text-muted-text">{a.blurb}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Recent projects" body="Jump back into active work.">
            <div className="mt-4">
              <EmptyState
                icon={FolderKanban}
                title="No projects yet"
                body="Projects bundle research, script, visuals, voice, and publishing into one pipeline. Create your first to see it here."
                action={<NewProjectButton label="Create project" />}
              />
            </div>
          </Card>
          <Card title="Recent activity" body="Renders, generations, comments, and publishes.">
            <div className="mt-4">
              <EmptyState
                title="Nothing happened yet"
                body="Activity appears here once background workers and collaboration ship in later phases."
              />
            </div>
          </Card>
        </div>
        <div className="space-y-4">
          <section aria-label="Usage and credits" className="rounded-xl border border-border bg-surface p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Gauge className="size-4 text-muted-text" aria-hidden="true" />
                Usage & credits
              </h2>
              <Badge tone="preview">Phase 10–11</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-text">
              Every generation, render, and research run is metered here.
            </p>
            <div className="mt-4">
              <EmptyState
                title="No usage yet"
                body="Balances, ledgers, and tiers activate with billing. No estimates are shown until metering is real."
              />
            </div>
          </section>
          <section aria-label="Performance snapshot" className="rounded-xl border border-border bg-surface p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Performance snapshot</h2>
              <Badge tone="preview">Phase 10</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-text">
              Real watch-time and retention feed back into strategy here.
            </p>
            <div className="mt-4">
              <EmptyState
                title="No channel connected"
                body="Connect YouTube in a later phase to see performance. Charts are never fabricated."
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
