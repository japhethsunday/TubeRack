"use client";

import { useState } from "react";
import Link from "next/link";
import { Clapperboard, X } from "lucide-react";
import { Sidebar } from "@/src/components/shell/Sidebar";
import { Header } from "@/src/components/shell/Header";
import { ToastProvider } from "@/src/components/ui/Toast";

/**
 * Professional application shell: sidebar + header + main + contextual slot.
 * Sidebar collapses to a drawer below lg; contextual actions render beside
 * content on xl screens, stacked below otherwise.
 */
export function AppShell({
  children,
  aside,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-background text-foreground">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-border bg-surface lg:block">
          <div className="flex h-16 items-center gap-2 border-b border-border px-4">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Clapperboard className="size-4" aria-hidden="true" />
            </span>
            <Link href="/dashboard" className="text-sm font-semibold tracking-tight">
              TubeRack
            </Link>
          </div>
          <div className="h-[calc(100vh-4rem)]">
            <Sidebar />
          </div>
        </aside>

        {/* Mobile nav drawer */}
        {navOpen && (
          <div className="fixed inset-0 z-[80] lg:hidden">
            <div aria-hidden="true" onClick={() => setNavOpen(false)} className="absolute inset-0 bg-black/50" />
            <aside
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              className="absolute left-0 top-0 h-full w-72 bg-surface shadow-xl"
            >
              <div className="flex h-16 items-center justify-between border-b border-border px-4">
                <span className="text-sm font-semibold">TubeRack</span>
                <button
                  type="button"
                  onClick={() => setNavOpen(false)}
                  aria-label="Close navigation"
                  autoFocus
                  className="rounded-md p-1 text-muted-text hover:bg-muted hover:text-foreground"
                >
                  <X className="size-5" aria-hidden="true" />
                </button>
              </div>
              <div className="h-[calc(100%-4rem)]">
                <Sidebar onNavigate={() => setNavOpen(false)} />
              </div>
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40">
            <Header onMenu={() => setNavOpen(true)} />
          </header>
          <div className="flex flex-1 items-start gap-6 px-4 py-6 sm:px-6 lg:px-8">
            <main id="main" className="min-w-0 flex-1" tabIndex={-1}>
              {children}
            </main>
            {aside && (
              <aside aria-label="Contextual actions" className="hidden w-80 shrink-0 xl:block">
                <div className="sticky top-24 rounded-xl border border-border bg-surface p-5">
                  {aside}
                </div>
              </aside>
            )}
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
