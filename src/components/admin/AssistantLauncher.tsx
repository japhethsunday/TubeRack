"use client";

import { Component, createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Bot, Maximize2, X } from "lucide-react";
import { AssistantChat, type Turn } from "@/src/components/admin/AssistantChat";

/**
 * The admin assistant as a floating button + panel on every admin page
 * (phone and desktop), sharing one conversation with the full Assistant page.
 * Lives only in the admin console — separate from the creators' support chat.
 */

/** Keeps an assistant crash inside the chat (with Retry) instead of taking down the page; reports it. */
export class ChatBoundary extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    void fetch("/api/v1/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: `assistant: ${String(error?.message ?? error)}`.slice(0, 500), path: window.location.pathname, stack: String(error?.stack ?? "").slice(0, 2000) }),
    }).catch(() => undefined);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm">
        <p>The assistant hit a problem. It has been reported.</p>
        <button type="button" onClick={() => this.setState({ failed: false })} className="rounded-lg bg-gradient-to-r from-fuchsia-600 via-violet-600 to-sky-600 px-4 py-2 font-medium text-white">
          Retry
        </button>
      </div>
    );
  }
}

type TurnsState = [Turn[], React.Dispatch<React.SetStateAction<Turn[]>>];
const Ctx = createContext<TurnsState | null>(null);

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const state = useState<Turn[]>([]);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useAssistantTurns(): TurnsState {
  const ctx = useContext(Ctx);
  const local = useState<Turn[]>([]);
  return ctx ?? local;
}

export function AssistantLauncher() {
  const path = usePathname();
  const [turns, setTurns] = useAssistantTurns();
  const [open, setOpen] = useState(false);

  // Close with Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // The full page already shows the chat.
  if (path === "/admin/assistant") return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open the admin assistant"
          className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-[70] flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-600 via-violet-600 to-sky-600 text-white shadow-xl shadow-violet-900/40 transition-transform hover:scale-105"
        >
          <span className="support-ring absolute inset-0 rounded-full" aria-hidden="true" />
          <Bot className="size-6" aria-hidden="true" />
        </button>
      )}
      {open && (
        <div
          role="dialog"
          aria-label="Admin assistant"
          className="support-panel fixed inset-x-2 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] top-[calc(0.5rem+env(safe-area-inset-top))] z-[70] flex flex-col overflow-hidden rounded-2xl border border-border bg-elevated shadow-2xl shadow-black/40 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:top-auto sm:h-[min(680px,calc(100dvh-2.5rem))] sm:w-[420px]"
        >
          <div className="flex items-center gap-3 bg-gradient-to-r from-fuchsia-600 via-violet-600 to-sky-600 px-4 py-3 text-white">
            <span className="flex size-9 items-center justify-center rounded-full bg-white/15">
              <Bot className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Admin assistant</p>
              <p className="truncate text-[11px] text-white/80">Changes only happen when you tap Confirm</p>
            </div>
            <Link href="/admin/assistant" onClick={() => setOpen(false)} aria-label="Open full screen" className="rounded-md p-2 hover:bg-white/15">
              <Maximize2 className="size-4" aria-hidden="true" />
            </Link>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-md p-2 hover:bg-white/15">
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <ChatBoundary>
              <AssistantChat turns={turns} setTurns={setTurns} compact />
            </ChatBoundary>
          </div>
        </div>
      )}
    </>
  );
}
