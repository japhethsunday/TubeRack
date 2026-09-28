"use client";

import { useEffect, useState } from "react";
import { Menu, Bell, CircleHelp, Command, Search } from "lucide-react";
import { BrandMark } from "@/src/components/ui/BrandMark";
import { IconButton } from "@/src/components/ui/IconButton";
import { Avatar } from "@/src/components/ui/Avatar";
import { Drawer } from "@/src/components/ui/overlays";
import { NotificationsList, useUnreadCount } from "@/src/components/shell/NotificationsList";
import { ThemeToggle } from "@/src/components/shell/ThemeToggle";
import { BackendBadge } from "@/src/components/shell/BackendStatus";
import { SyncIndicator } from "@/src/components/shell/SyncIndicator";
import { UserMenu } from "@/src/components/shell/UserMenu";
import { CreditsPill } from "@/src/components/shell/CreditsPill";
import { useSession } from "@/src/components/auth/useSession";
import Link from "next/link";
import { CommandMenu } from "@/src/components/ui/search";
import { Tooltip } from "@/src/components/ui/Tooltip";
import { useProjectsOptional } from "@/src/components/projects/ProjectsProvider";

/**
 * Application header: menu (mobile), search trigger, theme, notifications,
 * help, workspace + user controls. Drawers render honest empty/preview states.
 */
export function Header({ onMenu }: { onMenu: () => void }) {
  const [palette, setPalette] = useState(false);
  const [drawer, setDrawer] = useState<"none" | "notifications" | "help" | "account">("none");
  const workspace = useProjectsOptional();
  const session = useSession();
  const displayName = session.user?.name || session.user?.email || "Account";
  const [unread, refreshUnread] = useUnreadCount(session.status === "signed-in");
  const projectHits = (workspace?.projects ?? []).map((p) => ({
    id: p.id,
    label: p.name,
    blurb: `${p.topic} · ${p.status}`.slice(0, 80),
    href: `/projects/${p.id}`,
  }));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <div className="flex h-14 items-center gap-1.5 border-b border-border bg-surface px-3 backdrop-blur-xl sm:h-16 sm:gap-2 sm:px-4">
        <span className="hidden">
          <IconButton icon={Menu} label="Open navigation" onClick={onMenu} />
        </span>
        <button
          type="button"
          onClick={() => setPalette(true)}
          aria-label="Open command menu (Control or Command K)"
          className="hidden h-10 flex-1 items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 text-sm text-muted-text hover:bg-muted sm:flex sm:max-w-md"
        >
          <Command className="size-4" aria-hidden="true" />
          <span className="flex-1 text-left">Search pages…</span>
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px]">⌘K</kbd>
        </button>
        <Link href="/dashboard" className="flex items-center gap-2 sm:hidden" aria-label="Recktube home">
          <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500 via-violet-600 to-sky-500 text-white shadow-lg shadow-violet-900/30">
            <BrandMark className="size-[18px]" />
          </span>
        </Link>
        <span className="sm:hidden">
          <IconButton icon={Search} label="Search pages" onClick={() => setPalette(true)} />
        </span>
        <div className="ml-auto flex items-center gap-1">
          {/* Status badges and credits: desktop only (phones see credits in the account menu). */}
          <span className="hidden lg:contents">
            <SyncIndicator />
            <BackendBadge />
            {session.status === "signed-in" && <CreditsPill />}
          </span>
          {session.status === "signed-in" && (
            <span className="hidden items-center gap-2 rounded-lg px-2 md:flex">
              <span className="max-w-40 truncate text-sm font-medium">{displayName}</span>
            </span>
          )}
          <span className="hidden sm:inline-flex">
            <ThemeToggle />
          </span>
          <Tooltip tip="Notifications">
            <span className="relative inline-flex">
              <IconButton icon={Bell} label={unread ? `Notifications (${unread} unread)` : "Notifications"} onClick={() => setDrawer("notifications")} />
              {unread > 0 && (
                <span aria-hidden="true" className="pointer-events-none absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </span>
          </Tooltip>
          <span className="hidden sm:inline-flex">
            <Tooltip tip="Help and support">
              <IconButton icon={CircleHelp} label="Help and support" onClick={() => setDrawer("help")} />
            </Tooltip>
          </span>
          {session.status === "signed-out" ? (
            <span className="ml-1 flex items-center gap-1.5">
              <Link href="/login" className="hidden h-9 items-center rounded-lg px-3 text-sm font-medium hover:bg-muted sm:inline-flex">
                Sign in
              </Link>
              <Link href="/signup" className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90">
                Get started
              </Link>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setDrawer("account")}
              aria-label={`Account menu: ${displayName}`}
              className="rounded-full p-0.5 hover:bg-muted"
            >
              <Avatar name={session.user?.name || "Account"} size="sm" />
            </button>
          )}
        </div>
      </div>

      <CommandMenu
        open={palette}
        onClose={() => setPalette(false)}
        projectHits={projectHits}
        onNavigate={(href) => {
          const hit = projectHits.find((h) => h.href === href);
          if (hit) workspace?.recordSearch(hit.label);
        }}
      />

      {drawer === "notifications" && (
        <Drawer title="Notifications" description="Breakouts, trends, reminders, and test results." onClose={() => setDrawer("none")}>
          {session.status === "signed-in" ? (
            <NotificationsList onNavigate={() => setDrawer("none")} onRead={refreshUnread} />
          ) : (
            <p className="text-sm text-muted-text">Sign in to see your notifications.</p>
          )}
        </Drawer>
      )}
      {drawer === "help" && (
        <Drawer title="Help" description="Where to go for each task." onClose={() => setDrawer("none")}>
          <ul className="space-y-2 text-sm">
            {[
              { href: "/projects", title: "Start a project", body: "Create a project, then follow the pipeline stage by stage." },
              { href: "/intelligence", title: "Content Intelligence", body: "Analyze ideas, audiences, titles, hooks, and retention." },
              { href: "/intelligence/research", title: "YouTube research", body: "Search live videos and pull references into your studios." },
              { href: "/settings?tab=security", title: "Account & security", body: "Password, sessions, and email verification." },
            ].map((l) => (
              <li key={l.href}>
                <a href={l.href} onClick={() => setDrawer("none")} className="block rounded-lg border border-border p-3 hover:bg-muted">
                  <span className="font-medium">{l.title}</span>
                  <span className="block text-muted-text">{l.body}</span>
                </a>
              </li>
            ))}
          </ul>
        </Drawer>
      )}
      {drawer === "account" && <UserMenu user={session.user} onClose={() => setDrawer("none")} />}
    </>
  );
}
