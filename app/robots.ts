import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: ["/", "/signup", "/login", "/privacy", "/terms"], disallow: ["/api/", "/dashboard", "/projects", "/studio", "/settings"] },
    sitemap: "https://recktube.xyz/sitemap.xml",
    host: "https://recktube.xyz",
  };
}
