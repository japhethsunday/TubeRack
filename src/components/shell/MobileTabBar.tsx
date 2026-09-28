"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderKanban, LayoutDashboard, Lightbulb, Plus, UserRound } from "lucide-react";
import { cx } from "@/src/components/ui/cx";

const LEFT = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard, match: ["/dashboard"] },
  { href: "/content-creator", label: "Ideas", icon: Lightbulb, match: ["/content-creator", "/channel-creator", "/intelligence", "/video-recreator"] },
];
const RIGHT = [{ href: "/projects", label: "Projects", icon: FolderKanban, match: ["/projects", "/storage", "/activity", "/studio/script"] }];

/** Phone and tablet navigation: an app-style tab bar with a big Create button. Hidden from lg up, so desktop is unchanged. */
export function MobileTabBar({ onMore }: { onMore: () => void }) {
  const path = usePathname();
  const on = (m: string[]) => m.some((p) => path === p || path.startsWith(`${p}/`));
  const creating = path.startsWith("/studio/video");
  const tab = (t: (typeof LEFT)[number]) => {
    const active = on(t.match);
    return (
      <li key={t.href}>
        <Link
          href={t.href}
          aria-current={active ? "page" : undefined}
          className={cx("flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors active:scale-95", active ? "text-primary" : "text-muted-text")}
        >
          <t.icon className="size-[22px]" aria-hidden="true" strokeWidth={active ? 2.4 : 1.9} />
          {t.label}
        </Link>
      </li>
    );
  };
  return (
    <nav
      aria-label="Main"
      className="mobile-tabbar fixed inset-x-0 bottom-0 z-[55] border-t border-border bg-elevated/95 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid h-16 max-w-xl grid-cols-5">
        {LEFT.map(tab)}
        <li className="flex items-start justify-center">
          <Link
            href="/studio/video"
            aria-label="Create video"
            aria-current={creating ? "page" : undefined}
            className="-mt-5 flex flex-col items-center gap-1 text-[11px] font-semibold text-primary active:scale-95"
          >
            <span className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 via-violet-600 to-sky-500 text-white shadow-lg shadow-violet-900/40 ring-4 ring-background">
              <Plus className="size-7" aria-hidden="true" strokeWidth={2.5} />
            </span>
            Create
          </Link>
        </li>
        {RIGHT.map(tab)}
        <li>
          <button type="button" onClick={onMore} className="flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-text active:scale-95">
            <UserRound className="size-[22px]" aria-hidden="true" />
            Account
          </button>
        </li>
      </ul>
    </nav>
  );
}
