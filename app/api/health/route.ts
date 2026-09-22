import { NextResponse } from "next/server";

/** Liveness probe. No dependencies, safe for load balancers. */
export async function GET() {
  return NextResponse.json(
    { status: "ok", service: "tuberack", phase: 1 },
    { status: 200 },
  );
}
