import Link from "next/link";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/projects", label: "Projects" },
  { href: "/intelligence", label: "Intelligence" },
  { href: "/analytics", label: "Analytics" },
  { href: "/settings", label: "Settings" },
];

/** Slim in-app footer: brand line and real destinations, with subtle hover motion. */
export function AppFooter() {
  return (
    <footer className="mt-auto px-4 pb-6 pt-2 sm:px-6 lg:px-8">
      <div className="home-glow-border h-px w-full opacity-40 [animation:none]" aria-hidden="true" />
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 text-xs text-muted-text">
        <p>© {new Date().getFullYear()} TubeRack</p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-1">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="group relative hover:text-foreground">
              {l.label}
              <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-gradient-to-r from-fuchsia-500 to-sky-400 transition-[width] duration-300 ease-out group-hover:w-full" />
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
