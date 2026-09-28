import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/src/server/admin";
import { ADMIN_TEMPLATES, SECURITY_ADDRESS, SUPPORT_ADDRESS, missingFields, templateById } from "@/src/server/admin-mail";
import { sendEmail } from "@/src/server/email";
import { getServerEnv } from "@/src/lib/env";
import { audit } from "@/src/server/audit";
import { toErrorResponse, validationError } from "@/src/server/errors";
import { emailSchema, parseBody } from "@/src/server/validate";

/** GET /api/v1/admin/email — the branded templates you can send. */
export async function GET(request: Request) {
  try {
    await requireAdmin(request, "email.templates");
    return NextResponse.json({ data: ADMIN_TEMPLATES.map(({ build: _build, ...t }) => t) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const body = z.object({
  template: z.string().min(1).max(60),
  to: z.union([emailSchema, z.literal("")]).default(""),
  fields: z.record(z.string(), z.string().max(4000)).default({}),
  preview: z.boolean().default(false),
});

/** POST /api/v1/admin/email — preview or send a branded email (sends are audited). */
export async function POST(request: Request) {
  try {
    const input = await parseBody(request, body);
    const admin = await requireAdmin(request, input.preview ? "email.preview" : "email.send");
    const t = templateById(input.template);
    if (!t) throw validationError("Unknown template.");
    const app = getServerEnv().APP_URL.replace(/\/$/, "");
    const mail = t.build(input.fields, app);
    if (input.preview) return NextResponse.json({ data: { subject: mail.subject, html: mail.html } });
    if (!input.to) throw validationError("Add the recipient's email address.");
    const missing = missingFields(t, input.fields);
    if (missing.length) throw validationError(`Fill in: ${missing.join(", ")}.`);
    const security = t.mailbox === "security";
    const res = await sendEmail({
      to: input.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      kind: security ? "security" : "support",
      fromName: security ? "Recktube Security" : "Recktube Support",
      replyTo: security ? SECURITY_ADDRESS : SUPPORT_ADDRESS,
    });
    await audit({ userId: admin.id, action: "admin.email.sent", metadata: { template: t.id, to: input.to, sent: res.sent } });
    if (!res.sent) throw validationError(res.reason);
    return NextResponse.json({ data: res });
  } catch (error) {
    return toErrorResponse(error);
  }
}
