"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clapperboard, FolderKanban, LayoutDashboard, Lightbulb, Menu } from "lucide-react";
import { cx } from "@/src/components/ui/cx";

const TABS = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard, match: ["/dashboard"] },
  { href: "/content-creator", label: "Create", icon: Lightbulb, match: ["/content-creator", "/channel-creator", "/intelligence", "/video-recreator"] },
  { href: "/projects", label: "Projects", icon: FolderKanban, match: ["/projects", "/storage", "/activity"] },
  { href: "/studio/video", label: "Studio", icon: Clapperboard, match: ["/studio"] },
];

/** Phone and tablet navigation: an app-style tab bar. Hidden from lg up, so desktop is unchanged. */
export function MobileTabBar({ onMore }: { onMore: () => void }) {
  const path = usePathname();
  const on = (m: string[]) => m.some((p) => path === p || path.startsWith(`${p}/`));
  const anyOn = TABS.some((t) => on(t.match));
  return (
    <nav
      aria-label="Main"
      className="mobile-tabbar fixed inset-x-0 bottom-0 z-[55] border-t border-border bg-elevated/95 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid h-16 max-w-xl grid-cols-5">
        {TABS.map((t) => {
          const active = on(t.match);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors active:scale-95",
                  active ? "text-primary" : "text-muted-text",
                )}
              >
                <t.icon className="size-[22px]" aria-hidden="true" strokeWidth={active ? 2.4 : 1.9} />
                {t.label}
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onMore}
            className={cx("flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] font-medium active:scale-95", anyOn ? "text-muted-text" : "text-primary")}
          >
            <Menu className="size-[22px]" aria-hidden="true" />
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}
