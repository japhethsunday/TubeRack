"use client";

import Link from "next/link";
import { FlaskConical, PenLine, Clapperboard, ArrowRight } from "lucide-react";
import { NewProjectButton } from "@/src/components/projects/NewProjectDialog";
import { LocalStorageNote, useProjects } from "@/src/components/projects/ProjectsProvider";
import { continueLabelFor, progressOf } from "@/src/lib/projects/store";
import { stageLabel } from "@/src/lib/projects/storage";
import { timeAgo } from "@/src/components/projects/time";
import { ActivityFeed } from "@/src/components/projects/ActivityFeed";
import { EmptyState } from "@/src/components/ui/states";
import { Card } from "@/src/components/ui/Card";
import { Badge } from "@/src/components/ui/Badge";
import { Progress } from "@/src/components/ui/feedback";
import { LoadingState } from "@/src/components/ui/feedback";
import { useAnalytics } from "@/src/components/analytics/AnalyticsProvider";
import { sum, formatCompact } from "@/src/lib/analytics/metrics";

const QUICK_ACTIONS = [
  { href: "/intelligence/lab", icon: FlaskConical, label: "Analyze an idea", blurb: "Angles & evidence" },
  { href: "/studio/script", icon: PenLine, label: "Open Script Studio", blurb: "Write & structure" },
  { href: "/studio/video", icon: Clapperboard, label: "Open Video Studio", blurb: "Timeline & preview" },
];

/** Creator dashboard: real local state, honest empty states, no fabrication. */
export default function DashboardPage() {
  const { ready, projects, events, mostRecent, channelName } = useProjects();

  if (!ready) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <LoadingState label="Loading workspace" />
      </div>
    );
  }

  const active = projects.filter((p) => p.status !== "archived");
  const recent = [...active].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-text">
            Workspace
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {mostRecent ? `Continue: ${mostRecent.name}` : "Good evening, creator"}
          </h1>
          <p className="mt-1 text-sm text-muted-text">
            {mostRecent
              ? `${stageLabel(mostRecent.currentStage)} · ${progressOf(mostRecent)}% complete · updated ${timeAgo(mostRecent.updatedAt)}`
              : "Your next video starts here. Create a project to begin."}
          </p>
        </div>
        <NewProjectButton />
      </div>
      <LocalStorageNote compact />

      {mostRecent && (
        <section
          aria-label="Continue creating"
          className="rounded-xl border border-primary/30 bg-surface p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-text">
                Continue where you left off
              </p>
              <h2 className="mt-1 truncate text-lg font-semibold">{mostRecent.name}</h2>
              <p className="mt-0.5 text-sm text-muted-text">
                {channelName(mostRecent.channelId)} · {mostRecent.contentType} · {mostRecent.platform}
              </p>
              <div className="mt-3 max-w-md">
                <Progress value={progressOf(mostRecent)} label="Project progress" />
              </div>
            </div>
            <Link
              href={`/projects/${mostRecent.id}`}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              {continueLabelFor(mostRecent)}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      )}

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
          <Card title="Recent projects" body={recent.length > 0 ? "Jump back into active work." : "Projects you touch appear here."}>
            <div className="mt-4">
              {recent.length === 0 ? (
                <EmptyState
                  title="No projects yet"
                  body="Projects bundle research, script, visuals, voice, and publishing into one pipeline. Everything you create is stored on this device."
                  action={<NewProjectButton label="Create project" />}
                />
              ) : (
                <ul className="divide-y divide-border" aria-label="Recent projects">
                  {recent.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <Link href={`/projects/${p.id}`} className="block truncate text-sm font-medium hover:underline">
                          {p.name}
                        </Link>
                        <p className="text-xs text-muted-text">
                          {stageLabel(p.currentStage)} · {progressOf(p)}% · {timeAgo(p.updatedAt)}
                        </p>
                      </div>
                      <Link
                        href={`/projects/${p.id}`}
                        className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                      >
                        Open
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
          <Card title="Production activity" body={events.length > 0 ? "Latest workspace events." : "Creations, edits, and stage completions log here."}>
            <div className="mt-2">
              {events.length === 0 ? (
                <EmptyState
                  title="Nothing happened yet"
                  body="Activity is recorded only when you act — never generated."
                />
              ) : (
                <>
                  <ActivityFeed events={events} limit={5} />
                  <Link href="/activity" className="mt-2 inline-flex items-center gap-1 text-sm font-medium hover:underline">
                    View all activity <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </>
              )}
            </div>
          </Card>
        </div>
        <div className="space-y-4">
          <section aria-label="Usage and credits" className="rounded-xl border border-border bg-surface p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Usage & credits</h2>
              <Badge tone="neutral">Analytics</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-text">
              Every generation, render, and research run will be metered here.
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
              <Badge tone="preview">Manual + local</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-text">
              Self-reported logs and local production feed the learning loop.
            </p>
            <div className="mt-4">
              <PerformanceSnapshot />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function PerformanceSnapshot() {
  const { ready, entries, activeSignals } = useAnalytics();
  if (!ready) return <p className="text-sm text-muted-text">Loading…</p>;
  const views = sum(entries, (e) => e.views);
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-muted/50 p-2.5">
          <dt className="text-[11px] text-muted-text">Logged views</dt>
          <dd className="text-lg font-semibold tabular-nums">{formatCompact(views)}</dd>
        </div>
        <div className="rounded-lg bg-muted/50 p-2.5">
          <dt className="text-[11px] text-muted-text">Log entries</dt>
          <dd className="text-lg font-semibold tabular-nums">{entries.length}</dd>
        </div>
        <div className="rounded-lg bg-muted/50 p-2.5">
          <dt className="text-[11px] text-muted-text">Signals</dt>
          <dd className="text-lg font-semibold tabular-nums">{activeSignals.length}</dd>
        </div>
      </dl>
      {entries.length === 0 && (
        <p className="text-xs text-muted-text">
          No channel connected and nothing logged — log platform numbers by hand or import a YouTube video in Analytics. Charts are never fabricated.
        </p>
      )}
      <Link href="/analytics" className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90">
        Open Analytics
        <ArrowRight className="ml-1 size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
