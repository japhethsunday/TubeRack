"use client";

/**
 * Coalesce saves: many edits in a burst (typing) become one save shortly
 * after the burst ends, instead of serialising the whole library on every
 * keystroke. Always runs the newest save; anything pending is written
 * immediately when the page is hidden or closed, so nothing is lost.
 */
const pending = new Map<string, () => void>();
const timers = new Map<string, number>();
let hooked = false;

function run(key: string) {
  const t = timers.get(key);
  if (t !== undefined) window.clearTimeout(t);
  timers.delete(key);
  const fn = pending.get(key);
  pending.delete(key);
  try {
    fn?.();
  } catch (error) {
    console.error(`save (${key}) failed:`, error);
  }
}

export function flushSaves(): void {
  for (const key of [...pending.keys()]) run(key);
}

export function deferSave(key: string, fn: () => void, ms = 400): void {
  if (typeof window === "undefined") return fn();
  if (!hooked) {
    hooked = true;
    window.addEventListener("pagehide", flushSaves);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushSaves();
    });
  }
  pending.set(key, fn);
  if (!timers.has(key)) timers.set(key, window.setTimeout(() => run(key), ms));
}
