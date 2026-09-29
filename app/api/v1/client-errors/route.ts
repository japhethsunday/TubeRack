import { NextResponse } from "next/server";
import { z } from "zod";
import { sharedLimit } from "@/src/server/shared-limit";
import { clientKey } from "@/src/server/rate-limit";

const body = z.object({
  message: z.string().max(500),
  digest: z.string().max(100).default(""),
  path: z.string().max(300).default(""),
  stack: z.string().max(2000).default(""),
});

/** POST /api/v1/client-errors — pages that crash report what broke, so it shows in the server logs. */
export async function POST(request: Request) {
  try {
    await sharedLimit(`client-errors:${clientKey(request)}`, 20, 3600);
    const parsed = body.safeParse(await request.json());
    if (parsed.success) {
      const e = parsed.data;
      // Plain text only (no HTML/control characters) so a report can't forge log lines.
      const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ");
      console.error("[client-error]", clean(e.path), "|", clean(e.message), e.digest ? `| digest ${clean(e.digest)}` : "", "\n", clean(e.stack));
    }
  } catch {
    // rate limited or bad body: ignore
  }
  return new NextResponse(null, { status: 204 });
}
