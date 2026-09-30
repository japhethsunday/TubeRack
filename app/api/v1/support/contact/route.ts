import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import { clientKey } from "@/src/server/rate-limit";
import { sharedLimit } from "@/src/server/shared-limit";
import { sendEmail } from "@/src/server/email";
import { SUPPORT_ADDRESS } from "@/src/server/admin-mail";
import { audit } from "@/src/server/audit";
import { rateLimited, toErrorResponse, validationError } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";
import { SUPPORT_TOPICS } from "@/src/content/support";

export const dynamic = "force-dynamic";


const body = z.object({
  name: z.string().trim().min(1, "Add your name.").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  topic: z.enum(SUPPORT_TOPICS),
  message: z.string().trim().min(10, "Tell us a little more (at least 10 characters).").max(4000),
  /** Hidden field real people never fill in. */
  website: z.string().max(200).optional().default(""),
});

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * POST /api/v1/support/contact — the public Support page form. Sends the
 * message to support@ (so it lands in the admin inbox and Gmail) with the
 * sender as Reply-To. Rate-limited per visitor; bots are quietly dropped.
 */
export async function POST(request: Request) {
  try {
    const input = await parseBody(request, body);
    // Bots fill the hidden field: pretend it worked, send nothing.
    if (input.website) return NextResponse.json({ data: { sent: true } });
    const who = clientKey(request);
    try {
      await sharedLimit(`contact:${who}`, 5, 3600);
      await sharedLimit(`contact-email:${createHash("sha256").update(input.email).digest("hex").slice(0, 24)}`, 5, 86_400);
    } catch {
      throw rateLimited(3600);
    }
    const partnership = input.topic === "Partnership or press";
    const to = partnership ? "founder@recktube.xyz" : SUPPORT_ADDRESS;
    const text = `New message from the Recktube Support page\n\nName: ${input.name}\nEmail: ${input.email}\nTopic: ${input.topic}\n\n${input.message}\n\n— Reply to this email to answer ${input.name} directly.`;
    const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.6;color:#111">
<p style="color:#666;margin:0 0 12px">New message from the Recktube Support page</p>
<p style="margin:0"><strong>Name:</strong> ${esc(input.name)}<br><strong>Email:</strong> ${esc(input.email)}<br><strong>Topic:</strong> ${esc(input.topic)}</p>
<div style="margin:16px 0;padding:12px 14px;border-left:3px solid #7c3aed;background:#f6f3fd;white-space:pre-wrap">${esc(input.message)}</div>
<p style="color:#666;margin:0">Reply to this email to answer ${esc(input.name)} directly.</p></div>`;
    const res = await sendEmail({
      to,
      subject: `${input.topic} — ${input.name.replace(/[\r\n]/g, " ").slice(0, 60)}`,
      text,
      html,
      kind: "support",
      fromName: "Recktube Support page",
      fromAddress: SUPPORT_ADDRESS,
      replyTo: input.email,
    });
    await audit({ action: "support.contact_form", metadata: { topic: input.topic, sent: res.sent } }).catch(() => undefined);
    if (!res.sent) throw validationError("We couldn't send your message just now. Please email support@recktube.xyz instead.");
    return NextResponse.json({ data: { sent: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
