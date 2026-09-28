import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/src/server/auth";
import { getConversation, requestHuman, resolveConversation } from "@/src/server/support/service";
import { sendTranscript } from "@/src/server/support/emails";
import { sharedLimit } from "@/src/server/shared-limit";
import { limiterFor, callerKey } from "@/src/server/rate-limit";
import { rateLimited, toErrorResponse, validationError } from "@/src/server/errors";
import { parseBody, parseId } from "@/src/server/validate";

/** GET /api/v1/support/:id — one of the user's own conversations (marks team replies read). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const limit = limiterFor("read").take(`support:${callerKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const id = parseId((await ctx.params).id, "conversation");
    return NextResponse.json({ data: await getConversation(user.id, id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const body = z.object({
  action: z.enum(["human", "resolve", "email"]),
  note: z.string().trim().max(1500).default(""),
});

/** POST /api/v1/support/:id — ask for a teammate, mark solved, or email me a copy. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const limit = limiterFor("write").take(`support:${callerKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const id = parseId((await ctx.params).id, "conversation");
    const input = await parseBody(request, body);
    if (input.action === "human") {
      await sharedLimit(`support:human:${user.id}`, 5, 86_400);
      return NextResponse.json({ data: await requestHuman(user, id, input.note) });
    }
    if (input.action === "resolve") return NextResponse.json({ data: await resolveConversation(user.id, id) });
    // Email a copy — only ever to the account's own verified address.
    if (!user.emailVerifiedAt) throw validationError("Verify your email first, then we can send you a copy.");
    await sharedLimit(`support:email:${user.id}`, 5, 86_400);
    const conv = await getConversation(user.id, id, false);
    const res = await sendTranscript(user.email, user.name, conv.subject || "Support request", conv.messages);
    if (!res.sent) throw validationError("We couldn't send the email right now. Please try again in a moment.");
    return NextResponse.json({ data: { sent: true, to: user.email } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
