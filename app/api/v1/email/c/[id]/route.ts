import { NextResponse } from "next/server";
import { getDb } from "@/src/server/db";
import { getServerEnv } from "@/src/lib/env";
import { verifyTracked } from "@/src/server/unsubscribe";

/**
 * GET /api/v1/email/c/:id?u=&t= — campaign click: record it, then redirect.
 * The target is HMAC-signed at send time, so this can't be used as an open redirect.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = (await ctx.params).id;
  const url = new URL(request.url);
  const target = url.searchParams.get("u") ?? "";
  const token = url.searchParams.get("t") ?? "";
  const home = getServerEnv().APP_URL.replace(/\/$/, "");
  let safe = false;
  try {
    safe = /^[0-9a-f-]{36}$/.test(id) && /^https:\/\//i.test(target) && verifyTracked(id, target, token) && Boolean(new URL(target).hostname);
  } catch {
    safe = false;
  }
  if (!safe) return NextResponse.redirect(home, 302);
  const db = getDb();
  if (db) await db`UPDATE campaign_sends SET clicked_at = coalesce(clicked_at, now()), opened_at = coalesce(opened_at, now()) WHERE id = ${id}`.catch(() => undefined);
  return NextResponse.redirect(target, 302);
}
