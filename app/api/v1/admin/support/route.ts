import { NextResponse } from "next/server";
import { adminDb, requireAdmin } from "@/src/server/admin";
import { toErrorResponse } from "@/src/server/errors";

/** GET /api/v1/admin/support?status=handoff|open|resolved|all — support chats, newest first. */
export async function GET(request: Request) {
  try {
    await requireAdmin(request, "support.list");
    const status = new URL(request.url).searchParams.get("status") ?? "handoff";
    const filter = ["open", "handoff", "resolved"].includes(status) ? status : null;
    const db = adminDb();
    const rows = await db`
      SELECT c.id, c.status, c.subject, c.category, c.admin_unread, c.handoff_summary, c.updated_at, c.created_at,
        u.email, u.name,
        (SELECT count(*) FROM support_messages m WHERE m.conversation_id = c.id) AS messages
      FROM support_conversations c JOIN users u ON u.id = c.user_id
      WHERE ${filter ? db`c.status = ${filter}` : db`true`}
      ORDER BY c.admin_unread DESC, c.updated_at DESC LIMIT 100`;
    const [counts] = await db`
      SELECT count(*) FILTER (WHERE status = 'handoff') AS handoff, count(*) FILTER (WHERE status = 'open') AS open,
        count(*) FILTER (WHERE status = 'resolved') AS resolved, count(*) FILTER (WHERE admin_unread) AS unread
      FROM support_conversations`;
    return NextResponse.json({
      data: {
        counts: { handoff: Number(counts.handoff), open: Number(counts.open), resolved: Number(counts.resolved), unread: Number(counts.unread) },
        conversations: rows.map((r) => ({
          id: String(r.id),
          status: String(r.status),
          subject: String(r.subject),
          category: String(r.category),
          unread: Boolean(r.admin_unread),
          summary: String(r.handoff_summary),
          messages: Number(r.messages),
          email: String(r.email),
          name: String(r.name),
          updatedAt: new Date(String(r.updated_at)).toISOString(),
        })),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
