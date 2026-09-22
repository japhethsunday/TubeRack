"use client";

import { useId, useRef, useState } from "react";
import { cx } from "@/src/components/ui/cx";

export interface TabDef {
  id: string;
  label: string;
  content: React.ReactNode;
  badge?: string;
}

/** Accessible tabs: arrow-key navigation, aria-selected, real tabpanels. */
export function Tabs({ tabs, defaultId }: { tabs: TabDef[]; defaultId?: string }) {
  const [active, setActive] = useState(defaultId ?? tabs[0]?.id);
  const listRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const ids = tabs.map((t) => t.id);
    const i = ids.indexOf(active);
    const next = e.key === "ArrowRight" ? (i + 1) % ids.length : (i - 1 + ids.length) % ids.length;
    setActive(ids[next]);
    listRef.current
      ?.querySelector<HTMLButtonElement>(`[data-tab="${ids[next]}"]`)
      ?.focus();
  }

  const current = tabs.find((t) => t.id === active);
  return (
    <div>
      <div
        ref={listRef}
        role="tablist"
        aria-label="Sections"
        onKeyDown={onKeyDown}
        className="flex gap-1 overflow-x-auto border-b border-border"
      >
        {tabs.map((t) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              role="tab"
              data-tab={t.id}
              id={`${baseId}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(t.id)}
              className={cx(
                "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors duration-150",
                selected
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-text hover:text-foreground",
              )}
            >
              {t.label}
              {t.badge && (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-text">
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${active}`}
        className="pt-4"
      >
        {current?.content}
      </div>
    </div>
  );
}
