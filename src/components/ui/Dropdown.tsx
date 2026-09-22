"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cx } from "@/src/components/ui/cx";

export interface DropdownOption {
  id: string;
  label: string;
  hint?: string;
  disabled?: boolean;
}

/** Accessible dropdown: Enter/Space opens, arrows move, Escape closes. */
export function Dropdown({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: DropdownOption[];
  value?: string;
  onChange?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open ]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open && (e.key === "Enter" || e.key === " " || e.key === "ArrowDown")) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      const dir = e.key === "ArrowDown" ? 1 : -1;
      setFocus((f) => (f + dir + options.length) % options.length);
    }
    if (open && e.key === "Enter") {
      e.preventDefault();
      const opt = options[focus];
      if (opt && !opt.disabled) {
        onChange?.(opt.id);
        setOpen(false);
      }
    }
  }

  return (
    <div ref={rootRef} className="relative inline-block" onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-foreground transition-colors duration-150 hover:bg-muted"
      >
        <span className="max-w-40 truncate">{selected?.label ?? label}</span>
        <ChevronDown className="size-4 text-muted-text" aria-hidden="true" />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={label}
          className="absolute z-50 mt-1 min-w-44 rounded-lg border border-border bg-elevated p-1 shadow-lg"
        >
          {options.map((o, i) => (
            <li key={o.id}>
              <button
                type="button"
                role="option"
                aria-selected={o.id === value}
                disabled={o.disabled}
                onMouseEnter={() => setFocus(i)}
                onClick={() => {
                  onChange?.(o.id);
                  setOpen(false);
                }}
                className={cx(
                  "flex w-full items-center justify-between gap-4 rounded-md px-2.5 py-2 text-left text-sm",
                  i === focus ? "bg-muted text-foreground" : "text-foreground",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                <span>{o.label}</span>
                {o.hint && <span className="text-xs text-muted-text">{o.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
