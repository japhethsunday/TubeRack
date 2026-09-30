import { HELP_ARTICLES } from "@/src/content/help";
import type { MetadataRoute } from "next";

const BASE = "https://www.recktube.xyz";

/** Public pages only — everything behind sign-in stays out of search. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/help`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    ...HELP_ARTICLES.map((a) => ({ url: `${BASE}/help/${a.slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.5 })),
    { url: `${BASE}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
