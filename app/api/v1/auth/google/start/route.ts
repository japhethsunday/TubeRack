import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerEnv } from "@/src/lib/env";
import { isOAuthConfigured } from "@/src/server/google/oauth";
import { randomToken } from "@/src/server/crypto";
import { linkOrigin } from "@/src/server/email";
import { sanitizeReturnTo } from "@/src/lib/auth/session";

/** GET /api/v1/auth/google/start — "Continue with Google": send the visitor to Google's account chooser. */
export async function GET(request: Request) {
  const origin = linkOrigin(request);
  if (!isOAuthConfigured()) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("Google sign-in isn't available right now. Use email and password.")}`);
  }
  const state = randomToken(24);
  const store = await cookies();
  const secure = origin.startsWith("https");
  const returnTo = sanitizeReturnTo(new URL(request.url).searchParams.get("returnTo") ?? "/dashboard");
  store.set("g_login_state", state, { httpOnly: true, secure, sameSite: "lax", path: "/api/v1/auth/google", maxAge: 600 });
  store.set("g_login_return", returnTo, { httpOnly: true, secure, sameSite: "lax", path: "/api/v1/auth/google", maxAge: 600 });
  const q = new URLSearchParams({
    client_id: getServerEnv().GOOGLE_CLIENT_ID ?? "",
    redirect_uri: `${origin}/api/v1/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
    state,
  });
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`);
}
