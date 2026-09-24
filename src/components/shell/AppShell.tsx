"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppBackdrop } from "@/src/components/shell/AppBackdrop";
import { AppFooter } from "@/src/components/shell/AppFooter";
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
  const pathname = usePathname();

  return (
    <ToastProvider>
      <AppBackdrop />
      <div className="relative flex min-h-screen text-foreground">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-border bg-surface backdrop-blur-xl lg:block">
          <div className="flex h-16 items-center gap-2 border-b border-border px-4">
            <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500 via-violet-600 to-sky-500 text-white shadow-lg shadow-violet-900/30">
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
            <div aria-hidden="true" onClick={() => setNavOpen(false)} className="ui-overlay absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <aside
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              className="ui-drawer-left absolute left-0 top-0 h-full w-72 bg-elevated shadow-xl"
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
              <div key={pathname} className="ui-page">
                {children}
              </div>
            </main>
            {aside && (
              <aside aria-label="Contextual actions" className="hidden w-80 shrink-0 xl:block">
                <div className="ui-page sticky top-24 rounded-xl border border-border bg-surface p-5 backdrop-blur-xl">
                  {aside}
                </div>
              </aside>
            )}
          </div>
          <AppFooter />
        </div>
      </div>
    </ToastProvider>
  );
}
