"use client";

import { Component, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/src/lib/api";
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
export interface ChatSummary { id: string; title: string; updatedAt: string }
interface ChatsState {
  chatId: string | null;
  chats: ChatSummary[];
  newChat: () => void;
  openChat: (id: string) => Promise<void>;
  removeChat: (id: string) => Promise<void>;
}
const Ctx = createContext<{ turns: TurnsState; chats: ChatsState } | null>(null);

/**
 * One assistant conversation shared by the floating panel and the full page,
 * saved to the account (like the creators' support chat) so it survives
 * leaving the page, reloads and other devices.
 */
export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [turns, setTurnsRaw] = useState<Turn[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const dirty = useRef(false);
  const idRef = useRef<string | null>(null);
  const saving = useRef<Promise<unknown> | null>(null);

  const setTurns: React.Dispatch<React.SetStateAction<Turn[]>> = useCallback((v) => {
    dirty.current = true;
    setTurnsRaw(v);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const list = await api.get<ChatSummary[]>("/api/v1/admin/assistant/chats");
      setChats(list);
      return list;
    } catch {
      return [];
    }
  }, []);

  const openChat = useCallback(async (id: string) => {
    const c = await api.get<{ id: string; turns: Turn[] }>(`/api/v1/admin/assistant/chats?id=${encodeURIComponent(id)}`);
    dirty.current = false;
    idRef.current = c.id;
    setChatId(c.id);
    // A card that was mid-confirm when the page closed can be tried again.
    setTurnsRaw(c.turns.map((t) => (t.proposals ? { ...t, proposals: t.proposals.map((p) => (p.state === "busy" ? { ...p, state: "idle" } : p)) } : t)));
  }, []);

  // Pick up the latest conversation on first load.
  useEffect(() => {
    let live = true;
    api
      .get<ChatSummary[]>("/api/v1/admin/assistant/chats")
      .then((list) => {
        if (!live) return;
        setChats(list);
        if (list[0] && !dirty.current) void openChat(list[0].id).catch(() => undefined);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [openChat]);

  // Save after every change (debounced).
  useEffect(() => {
    if (!dirty.current || !turns.length) return;
    const t = setTimeout(() => {
      const run = async () => {
        if (saving.current) await saving.current.catch(() => undefined);
        const r = await api.post<{ id: string }>("/api/v1/admin/assistant/chats", { id: idRef.current, turns: turns.slice(-200) });
        if (!idRef.current) {
          idRef.current = r.id;
          setChatId(r.id);
          void refresh();
        }
      };
      saving.current = run().catch(() => undefined);
    }, 500);
    return () => clearTimeout(t);
  }, [turns, refresh]);

  const newChat = useCallback(() => {
    dirty.current = false;
    idRef.current = null;
    setChatId(null);
    setTurnsRaw([]);
    void refresh();
  }, [refresh]);

  const removeChat = useCallback(
    async (id: string) => {
      await api.remove(`/api/v1/admin/assistant/chats?id=${encodeURIComponent(id)}`);
      if (idRef.current === id) newChat();
      else void refresh();
    },
    [newChat, refresh],
  );

  const value = useMemo(() => ({ turns: [turns, setTurns] as TurnsState, chats: { chatId, chats, newChat, openChat, removeChat } }), [turns, setTurns, chatId, chats, newChat, openChat, removeChat]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAssistantTurns(): TurnsState {
  const ctx = useContext(Ctx);
  const local = useState<Turn[]>([]);
  return ctx?.turns ?? local;
}

export function useAssistantChats(): ChatsState | null {
  return useContext(Ctx)?.chats ?? null;
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
          className="support-launch fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-[70] flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-600 via-violet-600 to-sky-600 text-white shadow-xl shadow-violet-900/40 transition-transform hover:scale-105"
        >
          <span className="support-ring absolute inset-0 rounded-full" aria-hidden="true" />
          <Bot className="relative size-6" aria-hidden="true" />
        </button>
      )}
      {open && (
        <div
          role="dialog"
          aria-label="Admin assistant"
          className="support-panel fixed inset-x-2 bottom-2 z-[70] flex h-[min(640px,calc(100dvh-1rem))] flex-col overflow-hidden rounded-2xl border border-border bg-elevated shadow-2xl shadow-black/40 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[390px]"
        >
          <header className="relative overflow-hidden bg-gradient-to-br from-fuchsia-600 via-violet-700 to-sky-600 px-4 py-3 text-white">
            <div className="auth-grid absolute inset-0 opacity-50" aria-hidden="true" />
            <div className="relative flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-xl bg-white/15">
                <Bot className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="text-sm font-semibold">Admin assistant</p>
                <p className="flex items-center gap-1.5 truncate text-[11px] text-white/80">
                  <span className="size-1.5 rounded-full bg-emerald-300" /> Online · changes only happen when you Confirm
                </p>
              </div>
              <Link href="/admin/assistant" onClick={() => setOpen(false)} aria-label="Open full screen" className="rounded-md p-1 hover:bg-white/15">
                <Maximize2 className="size-4" aria-hidden="true" />
              </Link>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-md p-1 hover:bg-white/15">
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
          </header>
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
