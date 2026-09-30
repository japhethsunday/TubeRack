import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/src/components/home/SiteHeader";
import { SiteFooter } from "@/src/components/home/SiteFooter";
import { HELP_ARTICLES } from "@/src/content/help";
import { Linkify } from "@/src/components/home/Linkify";

export function generateStaticParams() {
  return HELP_ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = HELP_ARTICLES.find((x) => x.slug === slug);
  return a ? { title: `${a.title} · Recktube Help`, description: a.summary, alternates: { canonical: `/help/${a.slug}` } } : {};
}

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = HELP_ARTICLES.find((x) => x.slug === slug);
  if (!a) notFound();
  const related = HELP_ARTICLES.filter((x) => x.category === a.category && x.slug !== a.slug).slice(0, 3);
  return (
    <main id="main" className="relative min-h-screen bg-background text-foreground">
      <SiteHeader />
      <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Link href="/help" className="inline-flex items-center gap-1.5 text-xs text-foreground/60 hover:text-foreground">
          <ArrowLeft className="size-3.5" aria-hidden="true" /> Help Center
        </Link>
        <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400">{a.category}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{a.title}</h1>
        <p className="mt-3 text-base leading-relaxed text-foreground/70">{a.summary}</p>
        <div className="mt-8 space-y-3 text-sm leading-relaxed text-foreground/80">
          {a.body.map((p, i) => {
            const step = p.match(/^(\d+)\.\s+(.*)$/);
            if (step)
              return (
                <div key={i} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-xs font-semibold text-violet-700 dark:text-violet-300">{step[1]}</span>
                  <p className="pt-0.5"><Linkify text={step[2]} /></p>
                </div>
              );
            if (p.startsWith("• "))
              return (
                <p key={i} className="flex gap-2 pl-1">
                  <span className="text-violet-600 dark:text-violet-400" aria-hidden="true">•</span>
                  <span><Linkify text={p.slice(2)} /></span>
                </p>
              );
            return <p key={i}><Linkify text={p} /></p>;
          })}
        </div>
        {related.length > 0 && (
          <div className="mt-12">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground/50">Related</p>
            <ul className="mt-3 space-y-2">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link href={`/help/${r.slug}`} className="text-sm underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground">{r.title}</Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-12 rounded-3xl border border-foreground/10 bg-foreground/[0.02] p-5 text-sm">
          Didn&apos;t solve it? Email <a href="mailto:support@recktube.xyz" className="underline">support@recktube.xyz</a> or <Link href="/contact" className="underline">contact us</Link>.
        </div>
      </article>
      <SiteFooter />
    </main>
  );
}
