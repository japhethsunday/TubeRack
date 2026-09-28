import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/src/server/auth";
import { defaultWorkspace } from "@/src/server/sync";
import { chat, listConversations, MAX_MESSAGE } from "@/src/server/support/service";
import { sharedLimit } from "@/src/server/shared-limit";
import { limiterFor, callerKey } from "@/src/server/rate-limit";
import { rateLimited, toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

/** GET /api/v1/support — the signed-in user's own support conversations. */
export async function GET(request: Request) {
  try {
    const limit = limiterFor("read").take(`support:${callerKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    return NextResponse.json({ data: await listConversations(user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const body = z.object({
  conversationId: z.string().uuid().nullable().default(null),
  message: z.string().trim().min(1, "Write a message first.").max(MAX_MESSAGE, `Keep messages under ${MAX_MESSAGE} characters.`),
});

/** POST /api/v1/support — send a message; the assistant answers from the user's own account. */
export async function POST(request: Request) {
  try {
    const limit = limiterFor("expensive").take(`support:${callerKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const input = await parseBody(request, body);
    await sharedLimit(`support:day:${user.id}`, 40, 86_400);
    const workspaceId = await defaultWorkspace(user).catch(() => null);
    return NextResponse.json({ data: await chat(user, workspaceId, input.conversationId, input.message) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
