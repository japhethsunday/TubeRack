import { NextResponse } from "next/server";
import { AFF_COOKIE, AFF_COOKIE_DAYS, cleanAffCode, trackClick } from "@/src/server/growth/affiliates";
import { linkOrigin } from "@/src/server/email";
import { sharedLimit } from "@/src/server/shared-limit";
import { clientKey } from "@/src/server/rate-limit";

/** GET /go/CODE — an affiliate's link: count the click, remember it for 60 days, show the home page. */
export async function GET(request: Request, ctx: { params: Promise<{ code: string }> }) {
  const origin = linkOrigin(request);
  const res = NextResponse.redirect(`${origin}/`);
  try {
    // One counted click per visitor per code per hour, so refreshes don't inflate numbers.
    const { code: raw } = await ctx.params;
    const counted = await sharedLimit(`aff-click:${clientKey(request)}:${raw}`, 1, 3600).then(() => true, () => false);
    const code = counted ? await trackClick(raw) : cleanAffCode(raw);
    if (code && !request.headers.get("cookie")?.includes(`${AFF_COOKIE}=`)) {
      res.cookies.set(AFF_COOKIE, code, { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https"), path: "/", maxAge: AFF_COOKIE_DAYS * 86400 });
    }
  } catch {
    // Never break the visitor's landing.
  }
  return res;
}
