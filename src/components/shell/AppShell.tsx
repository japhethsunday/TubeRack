"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppBackdrop } from "@/src/components/shell/AppBackdrop";
import { AppFooter } from "@/src/components/shell/AppFooter";
import { Clapperboard, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { cx } from "@/src/components/ui/cx";
import { Sidebar } from "@/src/components/shell/Sidebar";
import { Header } from "@/src/components/shell/Header";
import { AccountNotice } from "@/src/components/shell/AccountNotice";
import { BackButton } from "@/src/components/shell/BackButton";
import { Suspense } from "react";
import { NextStepBar } from "@/src/components/projects/NextStep";
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
  // Desktop sidebar: full menu or a slim icon rail. Remembered on this device.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read the saved choice after hydration.
      if (localStorage.getItem("sidebar-collapsed") === "1") setCollapsed(true);
    } catch {
      /* storage unavailable */
    }
  }, []);
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem("sidebar-collapsed", c ? "0" : "1");
      } catch {
        /* storage unavailable */
      }
      return !c;
    });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b" && !(e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable=true]"))) {
        e.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <ToastProvider>
      <AppBackdrop />
      <div className="relative flex min-h-screen text-foreground">
        {/* Desktop sidebar */}
        <aside
          className={cx(
            "sticky top-0 hidden h-screen shrink-0 border-r border-border bg-surface backdrop-blur-xl transition-[width] duration-200 lg:block",
            collapsed ? "w-16" : "w-64",
          )}
        >
          <div className={cx("flex h-16 items-center border-b border-border", collapsed ? "justify-center px-2" : "gap-2 px-4")}>
            {!collapsed && (
              <>
                <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500 via-violet-600 to-sky-500 text-white shadow-lg shadow-violet-900/30">
                  <Clapperboard className="size-4" aria-hidden="true" />
                </span>
                <Link href="/dashboard" className="flex-1 text-sm font-semibold tracking-tight">
                  TubeRack
                </Link>
              </>
            )}
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Open the tools menu" : "Close the tools menu"}
              aria-expanded={!collapsed}
              title={`${collapsed ? "Open" : "Close"} menu (Ctrl+B)`}
              className="rounded-lg p-1.5 text-muted-text hover:bg-muted hover:text-foreground"
            >
              {collapsed ? <PanelLeftOpen className="size-5" aria-hidden="true" /> : <PanelLeftClose className="size-5" aria-hidden="true" />}
            </button>
          </div>
          <div className="h-[calc(100vh-4rem)]">
            <Sidebar collapsed={collapsed} />
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
              <Suspense fallback={null}>
                <BackButton />
              </Suspense>
              <AccountNotice />
              <NextStepBar />
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
