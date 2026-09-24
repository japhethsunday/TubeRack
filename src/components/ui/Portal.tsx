"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const noop = () => () => {};

/**
 * Renders children into document.body so fixed overlays are never clipped
 * or offset by an animated/transformed ancestor (e.g. `.ui-page`).
 */
export function Portal({ children }: { children: React.ReactNode }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return mounted ? createPortal(children, document.body) : null;
}
