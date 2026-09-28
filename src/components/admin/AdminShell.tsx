"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Activity, Coins, FolderKanban, Gauge, LogOut, Mail, Megaphone, Menu, ScrollText, Server, Users } from "lucide-react";
import { BrandMark } from "@/src/components/ui/BrandMark";
import { cx } from "@/src/components/ui/cx";

const NAV = [
  { href: "/admin", label: "Overview", icon: Gauge },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/credits", label: "Credits", icon: Coins },
  { href: "/admin/usage", label: "Generations", icon: Activity },
  { href: "/admin/projects", label: "Projects", icon: FolderKanban },
  { href: "/admin/email", label: "Email", icon: Mail },
  { href: "/admin/messages", label: "Announcements", icon: Megaphone },
  { href: "/admin/security", label: "Security log", icon: ScrollText },
  { href: "/admin/system", label: "System", icon: Server },
];

/** The admin console chrome: its own dark sidebar and top bar, nothing shared with the creator app. */
export function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));
  const sidebar = (
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
      <nav className="flex flex-col gap-0.5 p-3" aria-label="Admin">
        {NAV.map((n) => (
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
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-surface lg:flex">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button aria-label="Close menu" className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="relative flex h-full w-64 flex-col border-r border-border bg-surface">{sidebar}</aside>
        </div>
      )}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur lg:px-8">
          <button className="rounded-md p-1.5 text-muted-text hover:bg-muted lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu className="size-5" />
          </button>
          <span className="text-sm font-semibold">{NAV.find((n) => active(n.href))?.label ?? "Admin"}</span>
          <span className="ml-auto hidden items-center gap-2 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success sm:flex">
            <span className="size-1.5 rounded-full bg-success" /> Secure admin session
          </span>
        </header>
        <main className="mx-auto w-full max-w-7xl p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
