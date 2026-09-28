"use client";

/**
 * Keep the screen on during long work (generating or exporting a video).
 * Phones pause pages whose screen turns off, which used to stall exports
 * part-way. Re-acquired when the user comes back to the tab. Returns a release function.
 */
export function keepAwake(): () => void {
  let lock: { release: () => Promise<void> } | null = null;
  let done = false;
  const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
  const acquire = async () => {
    if (done || !nav.wakeLock || document.visibilityState !== "visible") return;
    try {
      lock = await nav.wakeLock.request("screen");
    } catch {
      lock = null; // not allowed (battery saver, old browser): the work still runs
    }
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") void acquire();
  };
  void acquire();
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    done = true;
    document.removeEventListener("visibilitychange", onVisible);
    void lock?.release().catch(() => {});
    lock = null;
  };
}

/** Phones and tablets (touch-first screens). */
export const isTouchDevice = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
