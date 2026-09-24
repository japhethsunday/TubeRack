"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { IconButton } from "@/src/components/ui/IconButton";

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Reads the class the pre-paint script set; the server renders "light" and React swaps after hydration. */
const isDark = () => document.documentElement.classList.contains("dark");

/** Theme toggle: persists to localStorage, respects OS preference on first load. */
export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("tuberack-theme", next ? "dark" : "light");
    } catch {
      // Private mode: theme simply won't persist. Not an error state.
    }
    listeners.forEach((l) => l());
  }

  return (
    <IconButton
      icon={dark ? Sun : Moon}
      label={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={toggle}
    />
  );
}
