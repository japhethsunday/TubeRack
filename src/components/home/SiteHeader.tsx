"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BarChart3, ChevronDown, Clapperboard, CircleDollarSign, Compass, FileText, Film, FlaskConical,
  ImageIcon, LayoutPanelTop, Lightbulb, Menu, Package, Radar, Rocket, Search, X,
} from "lucide-react";
import { ThemeToggle } from "@/src/components/shell/ThemeToggle";

type NavLink = { href: string; label: string; body: string; icon: typeof Search };

const MENUS: { label: string; links: NavLink[] }[] = [
  {
    label: "Product",
    links: [
      { href: "/channel-creator", label: "Channel Creator", body: "A full channel plan with 30 video ideas.", icon: Rocket },
      { href: "/content-creator", label: "Content Creator", body: "Ideas built on your channel and your niche's winners.", icon: Lightbulb },
      { href: "/studio/script", label: "Script Studio", body: "Write and rewrite scripts section by section.", icon: FileText },
      { href: "/studio/storyboard", label: "Storyboard", body: "Plan every shot before you record.", icon: LayoutPanelTop },
      { href: "/studio/media", label: "Media Studio", body: "Images, voice-over and music for each scene.", icon: ImageIcon },
      { href: "/studio/video", label: "Video Studio", body: "Edit on a timeline and export.", icon: Film },
      { href: "/studio/package", label: "Packaging & SEO", body: "Titles, thumbnails and descriptions.", icon: Package },
    ],
  },
  {
    label: "Intelligence",
    links: [
      { href: "/intelligence/niche", label: "Niche Finder", body: "Find niches with demand and room to grow.", icon: Radar },
      { href: "/intelligence/paying-niches", label: "Most Paying Niches", body: "Where advertisers and sponsors spend.", icon: CircleDollarSign },
      { href: "/intelligence", label: "Content Intelligence", body: "Score ideas, titles, hooks and retention.", icon: Compass },
      { href: "/intelligence/lab", label: "Idea Lab", body: "Test video ideas against real data.", icon: FlaskConical },
      { href: "/intelligence/research", label: "YouTube Research", body: "Search and study what's working.", icon: Search },
      { href: "/analytics", label: "Analytics", body: "Your channel's performance in one place.", icon: BarChart3 },
    ],
  },
];

const ANCHORS = [
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Features" },
];

function Dropdown({ label, links }: { label: string; links: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-foreground/70 hover:text-foreground"
      >
        {label}
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute left-1/2 top-full z-50 w-[34rem] -translate-x-1/2 pt-2">
          <ul className="grid grid-cols-2 gap-1 rounded-2xl border border-border bg-elevated p-2 shadow-xl">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="flex gap-3 rounded-xl p-3 hover:bg-muted"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
                    <l.icon className="size-4 text-foreground/80" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{l.label}</span>
                    <span className="block text-xs leading-snug text-muted-text">{l.body}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Public site header: fixed, blurs once the page scrolls, full menu on phones. */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-colors duration-200 ${
          scrolled || mobileOpen ? "border-b border-border bg-background/95 backdrop-blur-xl" : "border-b border-transparent"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
            <span className="flex size-9 items-center justify-center rounded-xl bg-foreground text-background">
              <Clapperboard className="size-4" aria-hidden="true" />
            </span>
            <span className="font-semibold tracking-tight">TubeRack</span>
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-1 text-sm lg:flex">
            {MENUS.map((m) => <Dropdown key={m.label} label={m.label} links={m.links} />)}
            {ANCHORS.map((a) => (
              <a key={a.href} href={a.href} className="rounded-lg px-3 py-2 text-foreground/70 hover:text-foreground">
                {a.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2 text-sm">
            <ThemeToggle />
            <Link href="/login" className="hidden rounded-lg px-3 py-2 font-medium text-foreground/80 hover:bg-foreground/10 hover:text-foreground sm:inline-flex">
              Sign in
            </Link>
            <Link href="/signup" className="rounded-lg bg-foreground px-3.5 py-2 font-medium text-background hover:bg-foreground/90">
              Get started
            </Link>
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-expanded={mobileOpen}
              aria-controls="site-mobile-menu"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              className="rounded-lg p-2 text-foreground/80 hover:bg-foreground/10 lg:hidden"
            >
              {mobileOpen ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <nav
            id="site-mobile-menu"
            aria-label="Main"
            className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-border bg-background px-4 pb-8 pt-4 lg:hidden"
          >
            {MENUS.map((m) => (
              <div key={m.label} className="mb-5">
                <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted-text">{m.label}</p>
                <ul>
                  {m.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} onClick={() => setMobileOpen(false)} className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm hover:bg-muted">
                        <l.icon className="size-4 text-foreground/70" aria-hidden="true" />
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <ul className="mb-5 border-t border-border pt-4">
              {ANCHORS.map((a) => (
                <li key={a.href}>
                  <a href={a.href} onClick={() => setMobileOpen(false)} className="block rounded-lg px-2 py-2.5 text-sm hover:bg-muted">
                    {a.label}
                  </a>
                </li>
              ))}
            </ul>
            <Link href="/login" onClick={() => setMobileOpen(false)} className="flex h-11 items-center justify-center rounded-lg border border-border text-sm font-medium hover:bg-muted">
              Sign in
            </Link>
          </nav>
        )}
      </header>
      <style>{"#how, #features { scroll-margin-top: 5rem; }"}</style>
      <div aria-hidden="true" className="h-16" />
    </>
  );
}
