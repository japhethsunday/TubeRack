import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireWorkspace } from "@/src/server/workspace";
import { exchangeTikTokCode, saveTikTokConnection } from "@/src/server/tiktok/client";
import { safeEqual } from "@/src/server/crypto";
import { linkOrigin } from "@/src/server/email";
import { audit } from "@/src/server/audit";
import { sanitizeReturnTo } from "@/src/lib/auth/session";

/** GET /api/v1/tiktok/callback — finish TikTok authorisation and store the sealed tokens. */
export async function GET(request: Request) {
  const origin = linkOrigin(request);
  const url = new URL(request.url);
  const store = await cookies();
  const returnTo = sanitizeReturnTo(store.get("tt_oauth_return")?.value ?? "/settings?tab=connections");
  const expected = store.get("tt_oauth_state")?.value ?? "";
  store.delete({ name: "tt_oauth_state", path: "/api/v1/tiktok" });
  store.delete({ name: "tt_oauth_return", path: "/api/v1/tiktok" });
  const back = (q: string) => NextResponse.redirect(`${origin}${returnTo}${returnTo.includes("?") ? "&" : "?"}${q}`);
  if (url.searchParams.get("error")) return back(`tiktok_error=${encodeURIComponent("TikTok sign-in was cancelled.")}`);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  if (!expected || !state || !safeEqual(state, expected) || !code) return back(`tiktok_error=${encodeURIComponent("Sign-in link expired. Please connect again.")}`);
  try {
    const caller = await requireWorkspace("editor");
    const tokens = await exchangeTikTokCode(code, origin);
    const scopes = (tokens.scope ?? "").split(",");
    if (!scopes.includes("video.publish") && !scopes.includes("video.upload")) {
      return back(`tiktok_error=${encodeURIComponent("Please allow Recktube to post videos when connecting TikTok.")}`);
    }
    const c = await saveTikTokConnection({ workspaceId: caller.workspaceId, userId: caller.user.id, tokens });
    await audit({ workspaceId: caller.workspaceId, userId: caller.user.id, action: "tiktok.connected", resourceType: "tiktok_account", resourceId: c.openId }).catch(() => undefined);
    return back("tiktok_connected=1");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not connect TikTok.";
    console.error("tiktok callback failed:", message.slice(0, 300));
    return back(`tiktok_error=${encodeURIComponent(message.slice(0, 200))}`);
  }
}
