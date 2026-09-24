"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cx } from "@/src/components/ui/cx";

function useDismiss(onClose: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
}

/** Accessible modal: aria-modal, Escape to close, initial focus, scroll lock. */
export function Modal({
  title,
  description,
  onClose,
  children,
  wide,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDismiss(onClose);
  useEffect(() => panelRef.current?.focus(), []);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="ui-overlay absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cx(
          "ui-modal relative max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-border bg-elevated p-6 shadow-2xl",
          wide ? "max-w-2xl" : "max-w-md",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            {description && (
              <p className="mt-1 text-sm text-muted-text">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            autoFocus
            className="rounded-md p-1 text-muted-text hover:bg-muted hover:text-foreground"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

/** Slide-over drawer: same contract as Modal, anchored right. */
export function Drawer({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDismiss(onClose);
  useEffect(() => panelRef.current?.focus(), []);

  return (
    <div className="fixed inset-0 z-[80]">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="ui-overlay absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="ui-drawer absolute right-0 top-0 flex h-full w-full max-w-sm flex-col border-l border-border bg-elevated p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            {description && (
              <p className="mt-1 text-sm text-muted-text">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            autoFocus
            className="rounded-md p-1 text-muted-text hover:bg-muted hover:text-foreground"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-4 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>
  );
}
