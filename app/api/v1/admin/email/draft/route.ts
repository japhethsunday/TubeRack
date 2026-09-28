import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/src/server/admin";
import { templateById } from "@/src/server/admin-mail";
import { draftTemplateFields } from "@/src/server/admin-ai";
import { toErrorResponse, validationError } from "@/src/server/errors";
import { emailSchema, parseBody } from "@/src/server/validate";

const body = z.object({
  template: z.string().min(1).max(60),
  instruction: z.string().trim().min(3, "Say what the email should say.").max(1200),
  to: z.union([emailSchema, z.literal("")]).default(""),
  current: z.record(z.string(), z.string().max(4000)).default({}),
});

/** POST /api/v1/admin/email/draft — fill a template's fields from a plain-language brief. */
export async function POST(request: Request) {
  try {
    const input = await parseBody(request, body);
    await requireAdmin(request, "email.draft");
    const template = templateById(input.template);
    if (!template) throw validationError("Unknown template.");
    const fields = await draftTemplateFields({ template, instruction: input.instruction, recipientEmail: input.to || undefined, current: input.current });
    return NextResponse.json({ data: { fields } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
