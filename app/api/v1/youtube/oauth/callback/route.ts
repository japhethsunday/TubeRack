import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireWorkspace } from "@/src/server/workspace";
import { exchangeCode, saveConnection } from "@/src/server/google/oauth";
import { safeEqual } from "@/src/server/crypto";
import { linkOrigin } from "@/src/server/email";
import { audit } from "@/src/server/audit";

/** GET /api/v1/youtube/oauth/callback — finish Google consent and store the sealed tokens. */
export async function GET(request: Request) {
  const origin = linkOrigin(request);
  const back = (q: string) => NextResponse.redirect(`${origin}/youtube?${q}`);
  const url = new URL(request.url);
  const store = await cookies();
  const expected = store.get("yt_oauth_state")?.value ?? "";
  store.delete({ name: "yt_oauth_state", path: "/api/v1/youtube/oauth" });
  if (url.searchParams.get("error")) return back(`error=${encodeURIComponent("Google sign-in was cancelled.")}`);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  if (!expected || !state || !safeEqual(state, expected) || !code) {
    return back(`error=${encodeURIComponent("Sign-in link expired. Please connect again.")}`);
  }
  try {
    const caller = await requireWorkspace("editor");
    const tokens = await exchangeCode(code, origin);
    const connection = await saveConnection({ workspaceId: caller.workspaceId, userId: caller.user.id, tokens });
    await audit({ workspaceId: caller.workspaceId, userId: caller.user.id, action: "youtube.connected", resourceType: "youtube_channel", resourceId: connection.channelId }).catch(() => undefined);
    return back("connected=1");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not connect YouTube.";
    console.error("youtube oauth callback failed:", message.slice(0, 300));
    return back(`error=${encodeURIComponent(message.slice(0, 200))}`);
  }
}
