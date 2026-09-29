import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@/src/lib/env";

export const dynamic = "force-dynamic";

/**
 * TikTok webhook endpoint (post status and account events). Only messages
 * signed by TikTok (TikTok-Signature: t=<time>,s=<HMAC-SHA256 of "t.body"
 * with the client secret>) are accepted; others are refused unread.
 */
function signedByTikTok(header: string | null, body: string): boolean {
  const secret = (getServerEnv().TIKTOK_CLIENT_SECRET ?? "").trim();
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=") as [string, string]));
  const t = Number(parts.t);
  if (!parts.s || !Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 600) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${body}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(parts.s));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const body = await request.text().catch(() => "");
  if (body.length > 100_000 || !signedByTikTok(request.headers.get("tiktok-signature"), body)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  console.log("[tiktok webhook]", body.slice(0, 500));
  return NextResponse.json({ ok: true });
}

/** TikTok's "Test URL" check. */
export async function GET() {
  return NextResponse.json({ ok: true });
}
