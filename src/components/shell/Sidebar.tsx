"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { NAV_SECTIONS, ALL_NAV_ITEMS, type NavItem } from "@/src/config/navigation";
import { Badge } from "@/src/components/ui/Badge";
import { cx } from "@/src/components/ui/cx";

/** Query-aware active matching, computed once per sidebar (hooks rule). */
function useActiveFor(): (item: NavItem) => boolean {
  const pathname = usePathname();
  const search = useSearchParams();
  return (item: NavItem) => {
    if (item.status !== "live") return false;
    const [hrefPath, query] = item.href.split("?");
    if (pathname !== hrefPath && !pathname.startsWith(`${hrefPath}/`)) return false;
    // A parent section yields to a more specific live item (e.g. /intelligence vs /intelligence/niche).
    const deeper = ALL_NAV_ITEMS.some((i) => {
      const p = i.href.split("?")[0];
      return i.status === "live" && p.length > hrefPath.length && p.startsWith(`${hrefPath}/`) && (pathname === p || pathname.startsWith(`${p}/`));
    });
    if (deeper) return false;
    if (!query) {
      // A query-less item yields to a same-path sibling whose query matches.
      const tab = search.get("tab");
      const claimed = ALL_NAV_ITEMS.filter(
        (i) => i.status === "live" && i.href.split("?")[0] === hrefPath && i.href.includes("?"),
      ).some((i) => new URLSearchParams(i.href.split("?")[1]).get("tab") === tab);
      return !claimed;
    }
    const want = new URLSearchParams(query);
    for (const [k, v] of want.entries()) {
      if (search.get(k) !== v) return false;
    }
    return true;
  };
}

function Item({
  item,
  active,
  onNavigate,
  collapsed = false,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const Icon = item.icon;

  const cls = cx(
    "group relative flex w-full items-center rounded-lg py-2 text-sm transition-[color,background-color] duration-200",
    collapsed ? "justify-center px-0" : "gap-2.5 px-3",
    active
      ? "bg-muted font-medium text-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-gradient-to-b before:from-fuchsia-500 before:to-sky-400"
      : "text-muted-text hover:bg-muted/60 hover:text-foreground",
    item.status === "planned" && "cursor-not-allowed opacity-60",
  );

  const inner = collapsed ? (
    <>
      <Icon className="size-[18px] shrink-0" aria-hidden="true" />
      <span className="sr-only">{item.label}</span>
    </>
  ) : (
    <>
      <Icon className="size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
      <span className="flex-1 truncate text-left">{item.label}</span>
      {item.status === "preview" && (
        <Badge tone="preview" className="px-1.5 py-0 text-[10px]">
          Preview
        </Badge>
      )}
      {item.status === "planned" && (
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-text">
          {item.phase}
        </span>
      )}
    </>
  );

  if (item.status === "planned") {
    return (
      <li>
        <span
          className={cls}
          aria-disabled="true"
          title={`${item.label} — arrives in ${item.phase}`}
        >
          {inner}
        </span>
      </li>
    );
  }
  return (
    <li>
      <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} title={collapsed ? item.label : undefined} className={cls}>
        {inner}
      </Link>
    </li>
  );
}

function NavList({ onNavigate, activeFor, collapsed = false }: { onNavigate?: () => void; activeFor: (item: NavItem) => boolean; collapsed?: boolean }) {
  return (
    <nav aria-label="Primary" className={cx("flex h-full flex-col overflow-y-auto overflow-x-hidden py-4", collapsed ? "gap-3 px-2" : "gap-6 px-3")}>
      {NAV_SECTIONS.map((section, si) => (
        <div key={section.title}>
          {collapsed ? (
            si > 0 && <div className="mx-2 mb-2 border-t border-border" aria-hidden="true" />
          ) : (
            <h2
              className={cx(
                "px-3 text-[11px] font-semibold uppercase tracking-wider text-disabled-text",
                si > 0 && "mt-1",
              )}
            >
              {section.title}
            </h2>
          )}
          <ul className={cx("space-y-0.5", !collapsed && "mt-1.5")}>
            {section.items.map((item) => (
              <Item key={item.slug} item={item} active={activeFor(item)} onNavigate={onNavigate} collapsed={collapsed} />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarLive({ onNavigate, collapsed }: { onNavigate?: () => void; collapsed?: boolean }) {
  const activeFor = useActiveFor();
  return <NavList onNavigate={onNavigate} activeFor={activeFor} collapsed={collapsed} />;
}

/** Hierarchized sidebar nav: primary work first, pipeline second, system last. */
export function Sidebar({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  return (
    <Suspense fallback={<NavList activeFor={() => false} collapsed={collapsed} />}>
      <SidebarLive onNavigate={onNavigate} collapsed={collapsed} />
    </Suspense>
  );
}
