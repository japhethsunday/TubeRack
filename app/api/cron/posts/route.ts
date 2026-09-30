import { NextResponse } from "next/server";
import { sharedLimit } from "@/src/server/shared-limit";
import { runDuePosts } from "@/src/server/tiktok/schedule";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/posts — posts scheduled TikTok videos that are due. Called
 * every 5 minutes by a database job. It needs no secret: it only ever posts
 * what an admin already scheduled for now or earlier, and it's rate-limited.
 */
export async function GET() {
  try {
    await sharedLimit("cron-posts", 40, 600);
  } catch {
    return NextResponse.json({ data: { skipped: true } });
  }
  const out = await runDuePosts();
  if (out.posted || out.failed) console.log("scheduled posts:", JSON.stringify(out));
  return NextResponse.json({ data: out });
}
