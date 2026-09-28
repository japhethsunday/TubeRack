"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Activity, Calculator, Clapperboard, Coins, FileDown, FolderKanban, Gauge, Gift, Headset, Inbox, Rocket, Send, LogOut, Mail, Megaphone, Menu, ScrollText, Server, ShieldUser, Tags, ToggleRight, TriangleAlert, Users, Wallet } from "lucide-react";
import { roleAllows, type AdminRole } from "@/src/lib/admin-roles";
import { BrandMark } from "@/src/components/ui/BrandMark";
import { cx } from "@/src/components/ui/cx";
import { MobileTables } from "@/src/components/shell/MobileTables";

export const NAV = [
  { href: "/admin", label: "Overview", icon: Gauge, group: "Overview", need: "overview" },
  { href: "/admin/users", label: "Users", icon: Users, group: "People", need: "users.list" },
  { href: "/admin/credits", label: "Credits", icon: Coins, group: "Money", need: "credits.list" },
  { href: "/admin/bulk-credits", label: "Bulk credits", icon: Gift, group: "Money", need: "bulk.view" },
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
  const active = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));
  const sidebar = (grouped: boolean) => (
    <>
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
        <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500 via-violet-600 to-sky-500 text-white">
          <BrandMark className="size-[18px]" />
        </span>
        <div className="leading-tight">
          <div className="text-sm font-bold">Recktube</div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-text">Admin console</div>
        </div>
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
            className={cx("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors", active(n.href) ? "bg-primary/15 text-primary" : "text-muted-text hover:bg-muted hover:text-foreground")}
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
        <nav className="flex flex-col gap-0.5 overflow-y-auto p-3" aria-label="Admin">
          {items.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            onClick={() => setOpen(false)}
            className={cx("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors", active(n.href) ? "bg-primary/15 text-primary" : "text-muted-text hover:bg-muted hover:text-foreground")}
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
    <div className="dark min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-surface lg:flex">{sidebar(false)}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button aria-label="Close menu" className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="relative flex h-full w-[min(18rem,85vw)] flex-col overflow-y-auto border-r border-border bg-surface pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">{sidebar(true)}</aside>
        </div>
      )}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center pt-[env(safe-area-inset-top)] lg:h-14 lg:pt-0 gap-3 border-b border-border bg-background/90 px-4 backdrop-blur lg:px-8">
          <button className="rounded-md p-1.5 text-muted-text hover:bg-muted lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu className="size-5" />
          </button>
          <span className="text-sm font-semibold">{items.find((n) => active(n.href))?.label ?? "Admin"}</span>
          <span className="ml-auto hidden items-center gap-2 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success sm:flex">
            <span className="size-1.5 rounded-full bg-success" /> Secure admin session
          </span>
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
                          <Link href={n.href} className="flex h-full flex-col items-center gap-1.5 rounded-xl border border-border bg-surface px-1 py-3 text-center text-[11px] font-medium leading-tight active:scale-95">
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
  );
}
