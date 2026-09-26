import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request CSP nonce. Inline scripts (Next's bootstrap and the theme
 * initialiser) run only when they carry this nonce, so injected markup
 * can't execute script even if it slips past sanitisation.
 */
/** The public address. The old vercel.app address forwards here so there is one home for the app. */
const CANONICAL_HOST = "www.recktube.xyz";
const LEGACY_HOSTS = new Set(["tube-rack.vercel.app"]);

export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  if (LEGACY_HOSTS.has(host)) {
    const url = new URL(request.nextUrl.pathname + request.nextUrl.search, `https://${CANONICAL_HOST}`);
    return NextResponse.redirect(url, 308);
  }
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV !== "production";
  // The configured storage origin (may be a custom domain), besides *.supabase.co.
  let storage = "";
  try {
    storage = process.env.SUPABASE_URL ? ` ${new URL(process.env.SUPABASE_URL).origin}` : "";
  } catch {
    storage = "";
  }
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // React style attributes need inline styles; styles can't run script.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    `img-src 'self' data: blob: https://*.supabase.co${storage} https://i.ytimg.com https://*.ytimg.com https://yt3.ggpht.com https://*.googleusercontent.com https://cdn.pixabay.com https://pixabay.com`,
    `media-src 'self' blob: data: https:`,
    `connect-src 'self' blob: data: https://*.supabase.co${storage} https://www.googleapis.com`,
    "frame-src https://www.youtube-nocookie.com https://www.youtube.com",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
