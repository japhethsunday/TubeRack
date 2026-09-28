import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb, requireAdmin } from "@/src/server/admin";
import { draftInboxReply } from "@/src/server/admin-ai";
import { notFound, toErrorResponse } from "@/src/server/errors";
import { parseBody, parseId } from "@/src/server/validate";

const body = z.object({ instruction: z.string().trim().max(800).default("") });

/** POST /api/v1/admin/support/:id/draft — draft the team's reply from the whole chat. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const input = await parseBody(request, body);
    await requireAdmin(request, "support.draft");
    const id = parseId((await ctx.params).id, "conversation");
    const db = adminDb();
    const [c] = await db`SELECT c.subject, c.category, c.handoff_summary, u.email, u.name FROM support_conversations c JOIN users u ON u.id = c.user_id WHERE c.id = ${id}`;
    if (!c) throw notFound("Conversation");
    const msgs = await db`SELECT role, body FROM support_messages WHERE conversation_id = ${id} ORDER BY created_at ASC LIMIT 60`;
    const transcript = msgs
      .map((m) => `${m.role === "user" ? "Creator" : m.role === "admin" ? "Recktube team" : m.role === "system" ? "Note" : "Assistant"}: ${String(m.body).slice(0, 1500)}`)
      .join("\n\n");
    const draft = await draftInboxReply({
      mailbox: c.category === "security" ? "security" : "support",
      fromName: String(c.name),
      fromEmail: String(c.email),
      subject: String(c.subject),
      body: `Support chat (answer the creator's latest open question; the assistant already replied where shown).\nHand-over summary: ${String(c.handoff_summary)}\n\n${transcript}`,
      instruction: input.instruction,
    });
    return NextResponse.json({ data: draft });
  } catch (error) {
    return toErrorResponse(error);
  }
}
