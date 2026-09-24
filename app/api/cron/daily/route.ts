import { NextResponse } from "next/server";
import { getServerEnv } from "@/src/lib/env";
import { safeEqual } from "@/src/server/crypto";
import { runDaily } from "@/src/server/growth/daily";

export const maxDuration = 300;

/** GET /api/cron/daily — Vercel Cron (Authorization: Bearer CRON_SECRET). */
export async function GET(request: Request) {
  const secret = getServerEnv().CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set." }, { status: 503 });
  const auth = request.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const summary = await runDaily();
  console.log("daily cron:", JSON.stringify(summary));
  return NextResponse.json({ data: summary });
}
