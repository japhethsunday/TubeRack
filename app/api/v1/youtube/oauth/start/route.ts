import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireWorkspace } from "@/src/server/workspace";
import { authUrl, isOAuthConfigured } from "@/src/server/google/oauth";
import { randomToken } from "@/src/server/crypto";
import { linkOrigin } from "@/src/server/email";

/** GET /api/v1/youtube/oauth/start — redirect to Google consent for the user's channel. */
export async function GET(request: Request) {
  const origin = linkOrigin(request);
  try {
    await requireWorkspace("editor");
  } catch {
    return NextResponse.redirect(`${origin}/login?returnTo=/youtube`);
  }
  if (!isOAuthConfigured()) {
    return NextResponse.redirect(`${origin}/youtube?error=${encodeURIComponent("Google sign-in is not configured yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).")}`);
  }
  const state = randomToken(24);
  const store = await cookies();
  store.set("yt_oauth_state", state, { httpOnly: true, secure: origin.startsWith("https"), sameSite: "lax", path: "/api/v1/youtube/oauth", maxAge: 600 });
  return NextResponse.redirect(authUrl(origin, state));
}
