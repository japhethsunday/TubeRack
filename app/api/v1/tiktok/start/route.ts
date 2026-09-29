import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireWorkspace } from "@/src/server/workspace";
import { isTikTokConfigured, tiktokAuthUrl } from "@/src/server/tiktok/client";
import { tiktokPaused } from "@/src/server/tiktok/post";
import { randomToken } from "@/src/server/crypto";
import { linkOrigin } from "@/src/server/email";
import { sanitizeReturnTo } from "@/src/lib/auth/session";

/** GET /api/v1/tiktok/start — send the user to TikTok to connect their account. */
export async function GET(request: Request) {
  const origin = linkOrigin(request);
  const returnTo = sanitizeReturnTo(new URL(request.url).searchParams.get("returnTo") ?? "/settings?tab=connections");
  const back = (msg: string) => NextResponse.redirect(`${origin}${returnTo}${returnTo.includes("?") ? "&" : "?"}tiktok_error=${encodeURIComponent(msg)}`);
  try {
    await requireWorkspace("editor");
  } catch {
    return NextResponse.redirect(`${origin}/login?returnTo=${encodeURIComponent(returnTo)}`);
  }
  if (!isTikTokConfigured()) return back("TikTok isn't set up yet.");
  const paused = await tiktokPaused();
  if (paused) return back(paused);
  const state = randomToken(24);
  const store = await cookies();
  const opts = { httpOnly: true, secure: origin.startsWith("https"), sameSite: "lax" as const, path: "/api/v1/tiktok", maxAge: 600 };
  store.set("tt_oauth_state", state, opts);
  store.set("tt_oauth_return", returnTo, opts);
  return NextResponse.redirect(tiktokAuthUrl(origin, state));
}
