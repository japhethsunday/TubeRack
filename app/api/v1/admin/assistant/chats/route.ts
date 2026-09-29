import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb, requireAdmin } from "@/src/server/admin";
import { notFound, toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const dynamic = "force-dynamic";

/**
 * Saved admin assistant conversations. Each admin only ever sees and
 * changes their own chats.
 */

const id = z.string().regex(/^[0-9a-f-]{36}$/);

/** GET — list my chats, or one with ?id=. */
export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request, "overview");
    const wanted = new URL(request.url).searchParams.get("id");
    if (wanted) {
      if (!id.safeParse(wanted).success) throw notFound("Chat");
      const [c] = await adminDb()`SELECT id, title, turns, updated_at FROM admin_assistant_chats WHERE id = ${wanted} AND admin_id = ${admin.id}`;
      if (!c) throw notFound("Chat");
      return NextResponse.json({ data: { id: String(c.id), title: String(c.title), turns: c.turns, updatedAt: new Date(String(c.updated_at)).toISOString() } });
    }
    const rows = await adminDb()`SELECT id, title, updated_at FROM admin_assistant_chats WHERE admin_id = ${admin.id} ORDER BY updated_at DESC LIMIT 30`;
    return NextResponse.json({ data: rows.map((r) => ({ id: String(r.id), title: String(r.title), updatedAt: new Date(String(r.updated_at)).toISOString() })) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const proposal = z.object({
  action: z.string().max(40),
  summary: z.string().max(2000),
  token: z.string().max(6000),
  state: z.enum(["idle", "busy", "done", "error", "dismissed"]).optional(),
  result: z.string().max(1000).optional(),
});
const save = z.object({
  id: id.nullable().default(null),
  turns: z
    .array(z.object({ role: z.enum(["admin", "assistant"]), text: z.string().max(8000), proposals: z.array(proposal).max(8).optional(), lookups: z.array(z.string().max(40)).max(10).optional(), open: z.string().regex(/^\/admin(\/[a-z-]+)?(\?q=[^#\s]{0,200})?$/).optional() }))
    .min(1)
    .max(200),
});

/** POST — create or update one of my chats. */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request, "overview");
    const input = await parseBody(request, save);
    // Finished cards never need their signed token again.
    const turns = input.turns.map((t) => (t.proposals ? { ...t, proposals: t.proposals.map((p) => (p.state === "done" || p.state === "dismissed" ? { ...p, token: "" } : p)) } : t));
    const title = (input.turns.find((t) => t.role === "admin")?.text ?? "Conversation").replace(/\s+/g, " ").trim().slice(0, 80);
    if (input.id) {
      const rows = await adminDb()`
        UPDATE admin_assistant_chats SET turns = ${JSON.stringify(turns)}, updated_at = now()
        WHERE id = ${input.id} AND admin_id = ${admin.id} RETURNING id`;
      if (!rows.length) throw notFound("Chat");
      return NextResponse.json({ data: { id: input.id } });
    }
    const [c] = await adminDb()`INSERT INTO admin_assistant_chats (admin_id, title, turns) VALUES (${admin.id}, ${title}, ${JSON.stringify(turns)}) RETURNING id`;
    return NextResponse.json({ data: { id: String(c.id) } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** DELETE ?id= — remove one of my chats. */
export async function DELETE(request: Request) {
  try {
    const admin = await requireAdmin(request, "overview");
    const wanted = new URL(request.url).searchParams.get("id") ?? "";
    if (!id.safeParse(wanted).success) throw notFound("Chat");
    await adminDb()`DELETE FROM admin_assistant_chats WHERE id = ${wanted} AND admin_id = ${admin.id}`;
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
