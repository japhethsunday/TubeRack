"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_SECTIONS, type NavItem } from "@/src/config/navigation";
import { Badge } from "@/src/components/ui/Badge";
import { cx } from "@/src/components/ui/cx";

function Item({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active =
    item.status === "live" &&
    (pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href)));
  const Icon = item.icon;

  const cls = cx(
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-150",
    active
      ? "bg-muted font-medium text-foreground"
      : "text-muted-text hover:bg-muted/60 hover:text-foreground",
    item.status === "planned" && "cursor-not-allowed opacity-60",
  );

  const inner = (
    <>
      <Icon className="size-4 shrink-0" aria-hidden="true" />
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
      <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cls}>
        {inner}
      </Link>
    </li>
  );
}

/** Hierarchized sidebar nav: primary work first, pipeline second, system last. */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Primary" className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-4">
      {NAV_SECTIONS.map((section, si) => (
        <div key={section.title}>
          <h2
            className={cx(
              "px-3 text-[11px] font-semibold uppercase tracking-wider text-disabled-text",
              si > 0 && "mt-1",
            )}
          >
            {section.title}
          </h2>
          <ul className="mt-1.5 space-y-0.5">
            {section.items.map((item) => (
              <Item key={item.slug} item={item} onNavigate={onNavigate} />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
