import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * TikTok webhook endpoint (post status and account events). Acknowledged
 * with 200 so TikTok keeps delivering; events are logged for now.
 */
export async function POST(request: Request) {
  const body = await request.text().catch(() => "");
  console.log("[tiktok webhook]", body.slice(0, 500));
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
