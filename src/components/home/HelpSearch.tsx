"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { HELP_ARTICLES, HELP_CATEGORIES, searchHelp } from "@/src/content/help";

/** Help Center: instant search over the articles, grouped by topic. */
/** `popular`: when not searching, show just these articles instead of every topic. */
export function HelpSearch({ popular }: { popular?: string[] } = {}) {
  const [q, setQ] = useState("");
  const found = useMemo(() => searchHelp(q), [q]);
  const searching = q.trim().length > 1;
  return (
    <div className="mt-8 space-y-10">
      <label className="relative block">
        <span className="sr-only">Search help articles</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-foreground/40" aria-hidden="true" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search: connect YouTube, credits, TikTok, video failed…"
          className="h-12 w-full rounded-2xl border border-foreground/10 bg-foreground/[0.03] pl-11 pr-4 text-base text-foreground outline-none transition placeholder:text-foreground/40 focus:border-violet-400/60 focus:shadow-[0_0_0_4px_rgba(139,92,246,0.15)] sm:text-sm"
        />
      </label>

      {searching ? (
        <section aria-live="polite">
          <p className="mb-3 text-xs text-foreground/50">{found.length ? `${found.length} article${found.length === 1 ? "" : "s"}` : "No articles match. Try other words, or contact us below."}</p>
          <ArticleList items={found} />
        </section>
      ) : popular ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-foreground/50">Popular answers</h2>
          <ArticleList items={popular.map((slug) => HELP_ARTICLES.find((a) => a.slug === slug)).filter((a): a is (typeof HELP_ARTICLES)[number] => Boolean(a))} />
        </section>
      ) : (
        HELP_CATEGORIES.map((c) => (
          <section key={c}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-foreground/50">{c}</h2>
            <ArticleList items={HELP_ARTICLES.filter((a) => a.category === c)} />
          </section>
        ))
      )}
    </div>
  );
}

function ArticleList({ items }: { items: typeof HELP_ARTICLES }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {items.map((a) => (
        <li key={a.slug}>
          <Link href={`/help/${a.slug}`} className="group flex h-full items-start gap-3 rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4 transition hover:-translate-y-0.5 hover:border-violet-400/40 hover:bg-violet-500/[0.06]">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">{a.title}</span>
              <span className="mt-1 block text-xs leading-relaxed text-foreground/60">{a.summary}</span>
            </span>
            <ChevronRight className="mt-0.5 size-4 shrink-0 text-foreground/30 transition group-hover:translate-x-0.5 group-hover:text-foreground/70" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
