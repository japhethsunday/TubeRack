"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Activity, Bot, Search, ShieldAlert, Calculator, Clapperboard, Coins, FileDown, FolderKanban, Gauge, Gift, Handshake, Headset, Inbox, Rocket, Send, LogOut, Mail, Megaphone, Menu, ScrollText, Server, ShieldUser, Tags, ToggleRight, Ticket, TriangleAlert, Users, Wallet, X } from "lucide-react";
import { roleAllows, type AdminRole } from "@/src/lib/admin-roles";
import { BrandMark } from "@/src/components/ui/BrandMark";
import { cx } from "@/src/components/ui/cx";
import { MobileTables } from "@/src/components/shell/MobileTables";
import { AssistantLauncher, AssistantProvider } from "@/src/components/admin/AssistantLauncher";

export const NAV = [
  { href: "/admin", label: "Overview", icon: Gauge, group: "Overview", need: "overview" },
  { href: "/admin/assistant", label: "Assistant", icon: Bot, group: "Overview", need: "overview" },
  { href: "/admin/safety", label: "Safety", icon: ShieldAlert, group: "People", need: "users.view" },
  { href: "/admin/users", label: "Users", icon: Users, group: "People", need: "users.list" },
  { href: "/admin/credits", label: "Credits", icon: Coins, group: "Money", need: "credits.list" },
  { href: "/admin/bulk-credits", label: "Bulk credits", icon: Gift, group: "Money", need: "bulk.view" },
  { href: "/admin/codes", label: "Bonus codes", icon: Ticket, group: "Money", need: "credits.list" },
  { href: "/admin/revenue", label: "Revenue", icon: Wallet, group: "Money", need: "revenue.view" },
  { href: "/admin/plans", label: "Plans & pricing", icon: Tags, group: "Money", need: "plans.view" },
  { href: "/admin/costs", label: "AI costs", icon: Calculator, group: "Money", need: "costs.view" },
  { href: "/admin/usage", label: "Generations", icon: Activity, group: "Operations", need: "usage.view" },
  { href: "/admin/failed", label: "Failed jobs", icon: TriangleAlert, group: "Operations", need: "jobs.view" },
  { href: "/admin/projects", label: "Projects", icon: FolderKanban, group: "Operations", need: "projects.view" },
  { href: "/admin/features", label: "Feature switches", icon: ToggleRight, group: "Operations", need: "features.view" },
  { href: "/admin/support", label: "Support chats", icon: Headset, group: "People", need: "support.list" },
  { href: "/admin/inbox", label: "Inbox", icon: Inbox, group: "People", need: "inbox.list" },
  { href: "/admin/email", label: "Email", icon: Mail, group: "Growth", need: "email.templates" },
  { href: "/admin/growth", label: "Growth", icon: Rocket, group: "Growth", need: "growth.view" },
  { href: "/admin/affiliates", label: "Affiliates", icon: Handshake, group: "Growth", need: "affiliates.view" },
  { href: "/admin/campaigns", label: "Campaigns", icon: Send, group: "Growth", need: "campaigns.list" },
  { href: "/admin/promo", label: "Promo videos", icon: Clapperboard, group: "Growth", need: "promo.list" },
  { href: "/admin/messages", label: "Announcements", icon: Megaphone, group: "Growth", need: "broadcast" },
  { href: "/admin/team", label: "Admin team", icon: ShieldUser, group: "Security", need: "team.view" },
  { href: "/admin/exports", label: "Data export", icon: FileDown, group: "Security", need: "export.view" },
  { href: "/admin/security", label: "Security log", icon: ScrollText, group: "Security", need: "audit.view" },
  { href: "/admin/system", label: "System", icon: Server, group: "Operations", need: "system" },
];
export const GROUPS = ["Overview", "People", "Money", "Operations", "Growth", "Security"] as const;

/** The admin console chrome: its own dark sidebar and top bar, nothing shared with the creator app. */
export function AdminShell({ email, role, children }: { email: string; role: AdminRole; children: React.ReactNode }) {
  const items = NAV.filter((n) => roleAllows(role, n.need));
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const matches = query.trim() ? items.filter((n) => `${n.label} ${n.group}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6) : [];
  const go = (href: string) => {
    setQuery("");
    router.push(href);
  };
  const tabs = items.filter((n) => ["/admin", "/admin/assistant", "/admin/safety", "/admin/users"].includes(n.href));
  const active = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));
  const sidebar = (grouped: boolean) => (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-4">
        <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500 via-violet-600 to-sky-500 text-white">
          <BrandMark className="size-[18px]" />
        </span>
        <div className="leading-tight">
          <div className="text-sm font-bold">Recktube</div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-text">Admin console</div>
        </div>
        {grouped && (
          <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="ml-auto rounded-lg p-2 text-muted-text hover:bg-white/5 hover:text-foreground">
            <X className="size-5" aria-hidden="true" />
          </button>
        )}
      </div>
      {grouped ? (
        <nav className="flex flex-col gap-4 p-3" aria-label="Admin">
          {GROUPS.map((g) => {
            const list = items.filter((n) => n.group === g);
            if (!list.length) return null;
            return (
              <div key={g}>
                <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-text">{g}</div>
                {list.map((n) => (
                  <Link
            key={n.href}
            href={n.href}
            onClick={() => setOpen(false)}
            className={cx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors", active(n.href) ? "admin-nav-active text-white" : "text-muted-text hover:bg-white/5 hover:text-foreground")}
          >
            <n.icon className="size-4" aria-hidden="true" />
            {n.label}
          </Link>
                ))}
              </div>
            );
          })}
        </nav>
      ) : (
        <nav className="admin-rail-nav flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-3" aria-label="Admin">
          {items.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            onClick={() => setOpen(false)}
            className={cx("flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors", active(n.href) ? "admin-nav-active text-white" : "text-muted-text hover:bg-white/5 hover:text-foreground")}
          >
            <n.icon className="size-4" aria-hidden="true" />
            {n.label}
          </Link>
          ))}
        </nav>
      )}
      <div className="mt-auto border-t border-border p-3 text-xs">
        <div className="truncate px-2 text-muted-text" title={email}>{email}</div>
        <Link href="/dashboard" className="mt-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-muted-text hover:bg-muted hover:text-foreground">
          <LogOut className="size-3.5" aria-hidden="true" /> Back to the app
        </Link>
      </div>
    </>
  );
  return (
    <AssistantProvider>
    <div className="admin-fx dark min-h-screen bg-background text-foreground">
      <div className="admin-frame lg:flex">
      {/* Desktop: the rail is fixed to the window (always full height, never scrolls away); a spacer keeps its place in the layout. */}
      <div className="hidden w-[16rem] shrink-0 lg:block" aria-hidden="true" />
      <aside className="admin-rail admin-rail-fixed z-40 hidden flex-col lg:flex">{sidebar(false)}</aside>
      {open && (
        <div className="fixed inset-0 z-[90] lg:hidden" role="dialog" aria-modal="true" aria-label="Admin menu">
          <button aria-label="Close menu" className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="admin-rail admin-drawer relative flex h-full w-[min(18rem,85vw)] flex-col overflow-y-auto pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-2xl shadow-black">{sidebar(true)}</aside>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-3 border-b border-white/10 bg-[#0b0814]/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:top-4 lg:mx-4 lg:h-14 lg:rounded-2xl lg:border lg:pt-0 lg:px-6">
          <button className="rounded-md p-1.5 text-muted-text hover:bg-muted lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu className="size-5" />
          </button>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-semibold lg:hidden">{items.find((n) => active(n.href))?.label ?? "Admin"}</span>
          {/* Quick tabs, like the reference's segmented control. */}
          <nav aria-label="Quick sections" className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 lg:flex">
            {tabs.map((n) => (
              <Link key={n.href} href={n.href} className={cx("rounded-full px-3 py-1 text-xs font-medium transition-colors", active(n.href) ? "admin-nav-active text-white" : "text-muted-text hover:text-foreground")}>
                {n.label}
              </Link>
            ))}
          </nav>
          {/* Command search: type a page name, Enter to jump. */}
          <div className="relative ml-auto hidden w-64 md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-text" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches[0]) go(matches[0].href);
                if (e.key === "Escape") setQuery("");
              }}
              placeholder="Search or jump to…"
              aria-label="Search admin pages"
              className="h-9 w-full rounded-full border border-white/10 bg-black/30 pl-8 pr-3 text-xs placeholder:text-muted-text focus:border-violet-400/50 focus:outline-none"
            />
            {matches.length > 0 && (
              <ul className="absolute right-0 top-11 z-50 w-full overflow-hidden rounded-xl border border-white/10 bg-[#120e1d]/95 p-1 shadow-2xl backdrop-blur-xl">
                {matches.map((n) => (
                  <li key={n.href}>
                    <button type="button" onClick={() => go(n.href)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-white/10">
                      <n.icon className="size-3.5 text-violet-300" aria-hidden="true" /> {n.label}
                      <span className="ml-auto text-[10px] text-muted-text">{n.group}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {items.some((n) => n.href === "/admin/exports") && (
            <Link href="/admin/exports" className="hidden h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-medium hover:bg-white/10 xl:inline-flex">
              <FileDown className="size-3.5" aria-hidden="true" /> Export data
            </Link>
          )}
          <Link href="/admin/assistant" className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-fuchsia-600 via-violet-600 to-sky-600 px-3 text-xs font-semibold text-white shadow-lg shadow-violet-900/40 hover:opacity-90 md:ml-0">
            <Bot className="size-3.5" aria-hidden="true" /> Ask assistant
          </Link>
        </header>
        <MobileTables />
        <main className="mx-auto w-full max-w-7xl p-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:p-4 lg:p-8">
          {path === "/admin" && (
            <nav aria-label="Admin sections" className="mb-6 space-y-5 lg:hidden">
              {GROUPS.filter((g) => g !== "Overview").map((g) => {
                const list = items.filter((n) => n.group === g);
                if (!list.length) return null;
                return (
                  <section key={g}>
                    <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-text">{g}</h2>
                    <ul className="grid grid-cols-3 gap-2">
                      {list.map((n) => (
                        <li key={n.href}>
                          <Link href={n.href} className="admin-glass flex h-full flex-col items-center gap-1.5 rounded-2xl border border-border px-1 py-3 text-center text-[11px] font-medium leading-tight active:scale-95">
                            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary"><n.icon className="size-[18px]" aria-hidden="true" /></span>
                            {n.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </nav>
          )}
          {children}</main>
      </div>
      </div>
      <AssistantLauncher />
    </div>
    </AssistantProvider>
  );
}
