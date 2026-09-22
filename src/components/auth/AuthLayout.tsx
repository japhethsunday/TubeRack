import Link from "next/link";
import { Clapperboard } from "lucide-react";

/** Centered auth layout: brand, card, and honest context. No shell nav. */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main id="main" className="flex min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col justify-center px-4 py-12">
        <Link href="/" aria-label="TubeRack home" className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Clapperboard className="size-4" aria-hidden="true" />
          </span>
          <span className="text-base font-semibold tracking-tight">TubeRack</span>
        </Link>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-text">{subtitle}</p>
        <div className="mt-6 rounded-xl border border-border bg-surface p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          {children}
        </div>
        {footer && <div className="mt-4 text-center text-sm text-muted-text">{footer}</div>}
      </div>
    </main>
  );
}
