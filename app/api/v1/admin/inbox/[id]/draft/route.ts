import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/src/server/admin";
import { getInboxEmail } from "@/src/server/inbox";
import { draftInboxReply } from "@/src/server/admin-ai";
import { toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

const body = z.object({
  instruction: z.string().trim().max(800).default(""),
  mailbox: z.enum(["support", "security"]).optional(),
});

/** Plain text of an HTML email (for messages that arrive without a text part). */
function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** POST /api/v1/admin/inbox/:id/draft — write a reply draft that answers this email. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const input = await parseBody(request, body);
    await requireAdmin(request, "inbox.draft");
    const email = await getInboxEmail((await ctx.params).id);
    const draft = await draftInboxReply({
      mailbox: input.mailbox ?? email.mailbox,
      fromName: email.fromName,
      fromEmail: email.replyTo,
      subject: email.subject,
      body: email.text || (email.html ? htmlToText(email.html) : ""),
      instruction: input.instruction,
    });
    return NextResponse.json({ data: draft });
  } catch (error) {
    return toErrorResponse(error);
  }
}
