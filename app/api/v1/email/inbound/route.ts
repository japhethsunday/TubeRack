import { NextResponse } from "next/server";
import { getServerEnv } from "@/src/lib/env";
import { autoReplyToEmail } from "@/src/server/support/auto-email";
import { verifySvix } from "@/src/server/svix";

export const maxDuration = 60;

/** POST /api/v1/email/inbound — Resend announces a received email; answer it if it's safe to. */
export async function POST(request: Request) {
  const secret = getServerEnv().RESEND_WEBHOOK_SECRET ?? "";
  if (!secret) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const body = await request.text();
  if (body.length > 256_000) return NextResponse.json({ error: "Too large." }, { status: 413 });
  const h = request.headers;
  if (!verifySvix(secret, h.get("svix-id") ?? "", h.get("svix-timestamp") ?? "", body, h.get("svix-signature") ?? "")) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }
  let event: { type?: string; data?: { email_id?: string; id?: string } };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Bad payload." }, { status: 400 });
  }
  if (event.type !== "email.received") return NextResponse.json({ data: { ignored: true } });
  const id = String(event.data?.email_id ?? event.data?.id ?? "");
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) return NextResponse.json({ error: "No email id." }, { status: 400 });
  try {
    return NextResponse.json({ data: await autoReplyToEmail(id) });
  } catch (error) {
    console.error("auto-reply failed:", error instanceof Error ? error.message : String(error));
    // 200 so the provider doesn't retry into a loop; the email stays in the admin inbox.
    return NextResponse.json({ data: { sent: false, reason: "failed" } });
  }
}
