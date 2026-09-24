"use client";

import { useId, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cx } from "@/src/components/ui/cx";

export interface TabDef {
  id: string;
  label: string;
  content: React.ReactNode;
  badge?: string;
}

/** Accessible tabs: arrow-key navigation, aria-selected, real tabpanels. */
export function Tabs({
  tabs,
  defaultId,
  onChange,
  urlParam,
}: {
  tabs: TabDef[];
  /** Selected tab; when it changes (e.g. the URL's ?tab= changed) the tabs follow. */
  defaultId?: string;
  onChange?: (id: string) => void;
  /** Keep the selected tab in this query param (e.g. "tab"), both ways. */
  urlParam?: string;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const fromUrl = urlParam ? search.get(urlParam) : null;
  const wanted = fromUrl && tabs.some((t) => t.id === fromUrl) ? fromUrl : defaultId;
  const [active, setActiveState] = useState(wanted ?? tabs[0]?.id);
  const [synced, setSynced] = useState(wanted);
  if (wanted !== synced) {
    setSynced(wanted);
    if (wanted) setActiveState(wanted);
  }
  function setActive(id: string) {
    setActiveState(id);
    onChange?.(id);
    if (urlParam && !onChange) {
      const q = new URLSearchParams(search.toString());
      q.set(urlParam, id);
      router.replace(`?${q.toString()}`, { scroll: false });
    }
  }
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
                "-mb-px whitespace-nowrap rounded-t-md border-b-2 px-3 py-2 text-sm transition-[color,border-color,background-color] duration-200 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
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
        <div key={active} className="ui-panel">
          {current?.content}
        </div>
      </div>
    </div>
  );
}
