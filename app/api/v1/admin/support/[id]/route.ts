import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb, requireAdmin } from "@/src/server/admin";
import { accountSnapshot } from "@/src/server/support/snapshot";
import { sendTeamReply } from "@/src/server/support/emails";
import { audit } from "@/src/server/audit";
import { notFound, toErrorResponse, validationError } from "@/src/server/errors";
import { parseBody, parseId } from "@/src/server/validate";

async function load(id: string) {
  const db = adminDb();
  const [c] = await db`
    SELECT c.*, u.email, u.name, u.email_verified_at FROM support_conversations c JOIN users u ON u.id = c.user_id WHERE c.id = ${id}`;
  if (!c) throw notFound("Conversation");
  const msgs = await db`SELECT id, role, body, created_at FROM support_messages WHERE conversation_id = ${id} ORDER BY created_at ASC LIMIT 300`;
  return { c, msgs };
}

/** GET /api/v1/admin/support/:id — the full chat plus the user's account snapshot. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request, "support.view");
    const id = parseId((await ctx.params).id, "conversation");
    const { c, msgs } = await load(id);
    if (c.admin_unread) await adminDb()`UPDATE support_conversations SET admin_unread = false WHERE id = ${id}`;
    const snapshot = await accountSnapshot(String(c.user_id), c.workspace_id ? String(c.workspace_id) : null);
    return NextResponse.json({
      data: {
        id: String(c.id),
        userId: String(c.user_id),
        status: String(c.status),
        subject: String(c.subject),
        category: String(c.category),
        summary: String(c.handoff_summary),
        email: String(c.email),
        name: String(c.name),
        verified: Boolean(c.email_verified_at),
        messages: msgs.map((m) => ({ id: String(m.id), role: String(m.role), body: String(m.body), createdAt: new Date(String(m.created_at)).toISOString() })),
        snapshot,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const body = z.object({
  action: z.enum(["reply", "resolve", "reopen"]),
  message: z.string().trim().max(8000).default(""),
  resolveAfter: z.boolean().default(false),
});

/** POST /api/v1/admin/support/:id — reply as the team (in-app + email), resolve or reopen. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const input = await parseBody(request, body);
    const admin = await requireAdmin(request, "support.act");
    const id = parseId((await ctx.params).id, "conversation");
    const { c } = await load(id);
    const db = adminDb();
    if (input.action === "reply") {
      if (!input.message) throw validationError("Write your reply.");
      await db`INSERT INTO support_messages (conversation_id, role, body, meta) VALUES (${id}, 'admin', ${input.message}, ${JSON.stringify({ by: admin.email })})`;
      await db`
        UPDATE support_conversations SET user_unread = true, admin_unread = false,
          status = ${input.resolveAfter ? "resolved" : "handoff"}, updated_at = now() WHERE id = ${id}`;
      let emailed = false;
      if (c.email_verified_at) emailed = (await sendTeamReply(String(c.email), String(c.name), String(c.subject) || "your support request", input.message)).sent;
      await audit({ userId: admin.id, action: "admin.support.reply", resourceType: "support_conversation", resourceId: id, metadata: { emailed } });
      return NextResponse.json({ data: { ok: true, emailed } });
    }
    await db`UPDATE support_conversations SET status = ${input.action === "resolve" ? "resolved" : "handoff"}, updated_at = now() WHERE id = ${id}`;
    await audit({ userId: admin.id, action: `admin.support.${input.action}`, resourceType: "support_conversation", resourceId: id });
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
