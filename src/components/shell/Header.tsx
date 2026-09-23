"use client";

import { useEffect, useState } from "react";
import { Menu, Bell, CircleHelp, Command } from "lucide-react";
import { IconButton } from "@/src/components/ui/IconButton";
import { Avatar } from "@/src/components/ui/Avatar";
import { Drawer } from "@/src/components/ui/overlays";
import { EmptyState } from "@/src/components/ui/states";
import { ThemeToggle } from "@/src/components/shell/ThemeToggle";
import { BackendBadge } from "@/src/components/shell/BackendStatus";
import { UserMenu } from "@/src/components/shell/UserMenu";
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
      <div className="flex h-16 items-center gap-2 border-b border-border bg-surface px-4">
        <span className="lg:hidden">
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
        <span className="sm:hidden" aria-hidden="true" />
        <div className="ml-auto flex items-center gap-1">
          <BackendBadge />
          {session.status === "signed-in" && (
            <span className="hidden items-center gap-2 rounded-lg px-2 md:flex">
              <span className="max-w-40 truncate text-sm font-medium">{displayName}</span>
            </span>
          )}
          <ThemeToggle />
          <Tooltip tip="Notifications">
            <IconButton icon={Bell} label="Notifications" onClick={() => setDrawer("notifications")} />
          </Tooltip>
          <Tooltip tip="Help and support">
            <IconButton icon={CircleHelp} label="Help and support" onClick={() => setDrawer("help")} />
          </Tooltip>
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
        <Drawer title="Notifications" description="Activity, renders, and mentions land here." onClose={() => setDrawer("none")}>
          <EmptyState
            title="No notifications yet"
            body="Render completions, comments, and performance alerts will appear here once background workers ship in Phase 11."
          />
        </Drawer>
      )}
      {drawer === "help" && (
        <Drawer title="Help & support" description="Docs and support channels." onClose={() => setDrawer("none")}>
          <ul className="space-y-2 text-sm">
            <li>
              <a href="/design" className="block rounded-lg border border-border p-3 hover:bg-muted">
                <span className="font-medium">Design system</span>
                <span className="block text-muted-text">Components, tokens, and UX patterns.</span>
              </a>
            </li>
            <li>
              <span className="block rounded-lg border border-border p-3 opacity-60" aria-disabled="true">
                <span className="font-medium">Support inbox — Phase 11</span>
                <span className="block text-muted-text">Account-linked help arrives with the backend.</span>
              </span>
            </li>
          </ul>
        </Drawer>
      )}
      {drawer === "account" && <UserMenu user={session.user} onClose={() => setDrawer("none")} />}
    </>
  );
}
