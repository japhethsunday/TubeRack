import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/src/server/admin";
import { getInboxEmail, mailboxAddress, parseAddress } from "@/src/server/inbox";
import { MAILBOX_SENDER, buildReply } from "@/src/server/admin-mail";
import { sendEmail } from "@/src/server/email";
import { getServerEnv } from "@/src/lib/env";
import { audit } from "@/src/server/audit";
import { toErrorResponse, validationError } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

/** GET /api/v1/admin/inbox/:id — one received email. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request, "inbox.read");
    return NextResponse.json({ data: await getInboxEmail((await ctx.params).id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const body = z.object({
  message: z.string().trim().min(1, "Write your reply.").max(8000),
  name: z.string().trim().max(80).default(""),
  mailbox: z.enum(["support", "security", "founder", "owner"]).optional(),
  preview: z.boolean().default(false),
});

/** POST /api/v1/admin/inbox/:id — preview or send a branded reply, threaded under the original. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const input = await parseBody(request, body);
    const admin = await requireAdmin(request, input.preview ? "inbox.preview" : "inbox.reply");
    const original = await getInboxEmail((await ctx.params).id);
    const mailbox = input.mailbox ?? original.mailbox;
    const from = mailboxAddress(mailbox);
    const app = getServerEnv().APP_URL.replace(/\/$/, "");
    const mail = buildReply(mailbox, app, {
      subject: original.subject,
      message: input.message,
      name: input.name,
      quoted: original.text,
      quotedFrom: original.fromName ? `${original.fromName} <${original.from}>` : original.from,
      receivedAt: original.receivedAt,
    });
    if (input.preview) return NextResponse.json({ data: { subject: mail.subject, html: mail.html } });
    const to = parseAddress(original.replyTo).address;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.endsWith("@recktube.xyz")) throw validationError("This email has no address to reply to.");
    const res = await sendEmail({
      to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      kind: mailbox === "security" ? "security" : mailbox === "support" ? "support" : "account",
      fromName: MAILBOX_SENDER[mailbox].name,
      fromAddress: from,
      replyTo: from,
      ...(original.messageId ? { headers: { "In-Reply-To": original.messageId, References: original.messageId } } : {}),
    });
    await audit({ userId: admin.id, action: "admin.inbox.replied", metadata: { email: original.id, to, from, sent: res.sent } });
    if (!res.sent) throw validationError(res.reason);
    return NextResponse.json({ data: { sent: true, to, from } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
