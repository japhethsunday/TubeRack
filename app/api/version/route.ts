import { NextResponse } from "next/server";
import packageJson from "@/package.json";

/** Build/deploy introspection. Reads only static package metadata. */
export async function GET() {
  return NextResponse.json(
    {
      service: "tuberack",
      version: (packageJson as { version: string }).version,
      phase: 1,
    },
    { status: 200 },
  );
}
