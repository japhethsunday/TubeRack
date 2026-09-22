"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { IconButton } from "@/src/components/ui/IconButton";

/** Theme toggle: persists to localStorage, respects OS preference on first load. */
export function ThemeToggle() {
  const [dark, setDark] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"),
  );

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("tuberack-theme", next ? "dark" : "light");
    } catch {
      // Private mode: theme simply won't persist. Not an error state.
    }
  }

  return (
    <IconButton
      icon={dark ? Sun : Moon}
      label={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={toggle}
    />
  );
}
