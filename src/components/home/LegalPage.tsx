import type { ReactNode } from "react";
import { SiteHeader } from "@/src/components/home/SiteHeader";
import { SiteFooter } from "@/src/components/home/SiteFooter";

/** Operator contact shown on the legal pages. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "support@recktube.xyz";

/** Shared shell for the public Privacy Policy and Terms pages. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main id="main" className="relative min-h-screen bg-background text-foreground">
      <SiteHeader />
      <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 [&_a]:underline [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:mt-1.5 [&_p]:mt-3 [&_p]:leading-relaxed [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 text-sm text-foreground/80">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        <p className="text-xs text-foreground/50">Last updated {updated}</p>
        {children}
      </article>
      <SiteFooter />
    </main>
  );
}
