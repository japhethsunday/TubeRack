"use client";

import { IdeaStarter } from "@/src/components/content/IdeaStarter";
import Link from "next/link";
import { BadgeDollarSign, ChevronRight, Clapperboard, FolderKanban, Lightbulb, PenLine, Play, Radar, Rocket } from "lucide-react";
import { NewProjectButton } from "@/src/components/projects/NewProjectDialog";
import { useProjects } from "@/src/components/projects/ProjectsProvider";
import { useSession } from "@/src/components/auth/useSession";
import { continueLabelFor, progressOf } from "@/src/lib/projects/store";
import { stageLabel } from "@/src/lib/projects/storage";
import { timeAgo } from "@/src/components/projects/time";

const TOOLS = [
  { href: "/content-creator", label: "Find ideas", sub: "What works in your niche", icon: Lightbulb, tint: "from-amber-400 to-orange-500" },
  { href: "/studio/script", label: "Write script", sub: "Retention-first drafts", icon: PenLine, tint: "from-sky-400 to-blue-600" },
  { href: "/studio/video", label: "Make video", sub: "Voice, visuals, music", icon: Clapperboard, tint: "from-fuchsia-500 to-violet-600" },
  { href: "/intelligence/paying-niches", label: "Paying niches", sub: "Where the money is", icon: BadgeDollarSign, tint: "from-emerald-400 to-teal-600" },
];

const MORE = [
  { href: "/intelligence/trends", label: "Trend Radar", icon: Radar },
  { href: "/channel-creator", label: "Channel Creator", icon: Rocket },
  { href: "/projects", label: "All projects", icon: FolderKanban },
];

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** The phone home screen: app-style, thumb-first. Desktop keeps its own dashboard. */
export function MobileHome() {
  const { projects, mostRecent } = useProjects();
  const session = useSession();
  const first = (session.user?.name ?? "").trim().split(/\s+/)[0];
  const recent = projects
    .filter((p) => p.status !== "archived")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 4);

  return (
    <div className="space-y-6 lg:hidden">
      <header className="pt-1">
        <p className="text-sm text-muted-text">{greeting()}{first ? "," : ""}</p>
        <h1 className="text-2xl font-bold tracking-tight">{first || "Creator"} 👋</h1>
      </header>

      {mostRecent ? (
        <Link
          href={`/projects/${mostRecent.id}`}
          className="relative block overflow-hidden rounded-3xl bg-gradient-to-br from-fuchsia-600 via-violet-700 to-indigo-800 p-5 text-white shadow-xl shadow-violet-900/30 active:scale-[0.99]"
        >
          <span aria-hidden="true" className="absolute -right-10 -top-10 size-40 rounded-full bg-white/10 blur-2xl" />
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/70">Continue</p>
          <h2 className="mt-1 line-clamp-2 text-lg font-semibold leading-snug">{mostRecent.name}</h2>
          <p className="mt-1 text-xs text-white/75">
            {stageLabel(mostRecent.currentStage)} · updated {timeAgo(mostRecent.updatedAt)}
          </p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-white" style={{ width: `${progressOf(mostRecent)}%` }} />
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-white/75">{progressOf(mostRecent)}% complete</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-violet-700">
              <Play className="size-3.5 fill-current" aria-hidden="true" />
              {continueLabelFor(mostRecent)}
            </span>
          </div>
        </Link>
      ) : (
        <div className="rounded-3xl bg-gradient-to-br from-fuchsia-600 via-violet-700 to-indigo-800 p-5 text-white shadow-xl shadow-violet-900/30">
          <h2 className="text-lg font-semibold">Make your first video</h2>
          <p className="mt-1 text-sm text-white/80">Start a project: idea, script, voice and visuals in one place.</p>
          <div className="mt-4 [&_button]:w-full [&_button]:justify-center [&_button]:rounded-full [&_button]:bg-white [&_button]:text-violet-700">
            <NewProjectButton label="Start a project" />
          </div>
        </div>
      )}

      <IdeaStarter />

      <section aria-labelledby="m-create">
        <h2 id="m-create" className="mb-3 text-base font-semibold">Create</h2>
        <ul className="grid grid-cols-2 gap-3">
          {TOOLS.map((t) => (
            <li key={t.href}>
              <Link href={t.href} className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-4 active:scale-[0.98]">
                <span className={`flex size-11 items-center justify-center rounded-xl bg-gradient-to-br ${t.tint} text-white shadow-md`}>
                  <t.icon className="size-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{t.label}</span>
                  <span className="block text-xs leading-snug text-muted-text">{t.sub}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="m-recent">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="m-recent" className="text-base font-semibold">Recent projects</h2>
          {recent.length > 0 && (
            <Link href="/projects" className="text-sm font-medium text-primary">See all</Link>
          )}
        </div>
        {recent.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted-text">
            Your projects will show up here.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {recent.map((p) => (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="flex items-center gap-3 px-4 py-3.5 active:bg-muted">
                  <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
                    {progressOf(p)}%
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-muted-text">
                      {stageLabel(p.currentStage)} · {timeAgo(p.updatedAt)}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-text" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {recent.length > 0 && (
          <div className="mt-3 [&_button]:w-full [&_button]:justify-center">
            <NewProjectButton label="New project" />
          </div>
        )}
      </section>

      <section aria-labelledby="m-more">
        <h2 id="m-more" className="mb-3 text-base font-semibold">Explore</h2>
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {MORE.map((m) => (
            <li key={m.href} className="shrink-0">
              <Link href={m.href} className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium active:bg-muted">
                <m.icon className="size-4 text-primary" aria-hidden="true" />
                {m.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
