"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search as SearchIcon, CornerDownLeft } from "lucide-react";
import { SEARCHABLE_ROUTES, COMMAND_INDEX } from "@/src/config/navigation";
import { cx } from "@/src/components/ui/cx";

/** Search input: label, clear action, keyboard focusable. */
export function Search({
  value,
  onChange,
  placeholder = "Search…",
  label = "Search",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
}) {
  return (
    <div role="search" className="relative">
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-text"
      />
      <input
        type="search"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm placeholder:text-disabled-text hover:border-muted-text/50"
      />
    </div>
  );
}

/** ⌘K command menu over real routes only. Arrows + Enter + Escape. */
export function CommandMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState(0);
  const [prevOpen, setPrevOpen] = useState(open);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on open without an effect (render-time adjustment, no cascade).
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setQuery("");
      setFocus(0);
    }
  }

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMAND_INDEX;
    return COMMAND_INDEX.filter(
      (r) => r.label.toLowerCase().includes(q) || r.blurb.toLowerCase().includes(q),
    );
  }, [query]);

  const safeFocus = results.length === 0 ? 0 : focus % results.length;

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open ]);

  if (!open) return null;

  function go(href: string) {
    onClose();
    router.push(href);
  }

  return (
    <div className="fixed inset-0 z-[85] flex justify-center p-4 pt-[12vh]">
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command menu"
        className="relative h-fit w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setFocus((f) => (f + 1) % Math.max(results.length, 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setFocus((f) => (f - 1 + Math.max(results.length, 1)) % Math.max(results.length, 1));
          }
          if (e.key === "Enter" && results[safeFocus]) go(results[safeFocus].href);
        }}
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <SearchIcon className="size-4 text-muted-text" aria-hidden="true" />
          <input
            ref={inputRef}
            aria-label="Search pages and actions"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages…"
            className="h-12 w-full bg-transparent text-sm placeholder:text-disabled-text focus:outline-none"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-text">
            ESC
          </kbd>
        </div>
        <ul role="listbox" aria-label="Results" className="max-h-72 overflow-y-auto p-2">
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-text">
              No matching pages.
            </li>
          )}
          {results.map((r, i) => (
            <li key={r.slug}>
              <button
                type="button"
                role="option"
                aria-selected={i === safeFocus}
                onMouseEnter={() => setFocus(i)}
                onClick={() => go(r.href)}
                className={cx(
                  "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left",
                  i === safeFocus ? "bg-muted" : "",
                )}
              >
                <span>
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <r.icon className="size-4 text-muted-text" aria-hidden="true" />
                    {r.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-text">{r.blurb}</span>
                </span>
                {i === safeFocus && (
                  <CornerDownLeft className="size-4 shrink-0 text-muted-text" aria-hidden="true" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
