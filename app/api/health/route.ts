import { NextResponse } from "next/server";

/** Liveness probe. No dependencies, safe for load balancers. */
export async function GET() {
  return NextResponse.json(
    // version: the deployed commit, so a deploy can prove it's live.
    { status: "ok", service: "tuberack", phase: 1, version: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}
