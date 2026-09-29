import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request CSP nonce. Inline scripts (Next's bootstrap and the theme
 * initialiser) run only when they carry this nonce, so injected markup
 * can't execute script even if it slips past sanitisation.
 */
/** The public address. The old vercel.app address forwards here so there is one home for the app. */
const CANONICAL_HOST = "www.recktube.xyz";
const LEGACY_HOSTS = new Set(["tube-rack.vercel.app"]);

/**
 * Remember where a visitor came from (?ref=invite code, ?utm_source/utm_campaign)
 * for 30 days, first touch wins, so sign-up can credit the right campaign or friend.
 */
function rememberAttribution(request: NextRequest, response: NextResponse) {
  const q = request.nextUrl.searchParams;
  const opts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86400 };
  const ref = (q.get("ref") ?? "").toUpperCase();
  if (/^[A-Z2-9]{6,12}$/.test(ref) && !request.cookies.get("rt_ref")) response.cookies.set("rt_ref", ref, opts);
  const clean = (v: string | null) => (v ?? "").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 60);
  const src = clean(q.get("utm_source"));
  if (src && !request.cookies.get("rt_src")) {
    response.cookies.set("rt_src", src, opts);
    const cmp = clean(q.get("utm_campaign"));
    if (cmp) response.cookies.set("rt_cmp", cmp, opts);
  }
}

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
  // Cloudflare R2 (presigned file links, uploads and downloads).
  storage += " https://*.r2.cloudflarestorage.com";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // React style attributes need inline styles; styles can't run script.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    `img-src 'self' data: blob: https://*.supabase.co${storage} https://i.ytimg.com https://*.ytimg.com https://yt3.ggpht.com https://*.googleusercontent.com https://cdn.pixabay.com https://pixabay.com https://*.tiktokcdn.com https://*.tiktokcdn-us.com https://*.tiktokcdn-eu.com`,
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
  rememberAttribution(request, response);
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
