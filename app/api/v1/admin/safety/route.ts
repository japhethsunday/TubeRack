import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb, adminRole, requireAdmin } from "@/src/server/admin";
import { runAction } from "@/src/server/admin-agent/actions";
import { scanSafety } from "@/src/server/safety";
import { forbidden, notFound, toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** GET /api/v1/admin/safety — flags (open first) with evidence and what was done automatically. */
export async function GET(request: Request) {
  try {
    await requireAdmin(request, "users.view");
    const rows = await adminDb()`
      SELECT f.id, f.kind, f.severity, f.evidence, f.status, f.auto_action, f.created_at, f.resolved_at, u.email, u.status AS user_status
      FROM safety_flags f LEFT JOIN users u ON u.id = f.user_id
      ORDER BY (f.status = 'open') DESC, f.created_at DESC LIMIT 200`;
    return NextResponse.json(
      {
        data: rows.map((r) => ({
          id: String(r.id), kind: String(r.kind), severity: String(r.severity), evidence: String(r.evidence), status: String(r.status),
          autoAction: String(r.auto_action), email: r.email ? String(r.email) : null, userStatus: r.user_status ? String(r.user_status) : null,
          createdAt: new Date(String(r.created_at)).toISOString(),
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

const act = z.object({ id: z.string().min(1).max(64), action: z.enum(["suspend", "reactivate", "dismiss", "resolve"]) });

/** PATCH — act on a flag: suspend or reactivate its account (emails them), or dismiss it. */
export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin(request, "users.view");
    const role = await adminRole(admin);
    if (!role) throw forbidden("Admins only.");
    const b = await parseBody(request, act);
    const [f] = await adminDb()`SELECT f.id, u.email FROM safety_flags f LEFT JOIN users u ON u.id = f.user_id WHERE f.id = ${b.id}`;
    if (!f) throw notFound("Flag");
    let result = "";
    if (b.action === "suspend" || b.action === "reactivate") {
      if (!f.email) throw notFound("User");
      const out = await runAction(admin, role, b.action === "suspend" ? "suspend_user" : "reactivate_user", b.action === "suspend" ? { email: String(f.email), reason: "Safety review" } : { email: String(f.email) });
      result = typeof out === "string" ? out : out.text;
    }
    await adminDb()`
      UPDATE safety_flags SET status = ${b.action === "dismiss" ? "dismissed" : "actioned"}, resolved_by = ${admin.id}, resolved_at = now() WHERE id = ${b.id}`;
    return NextResponse.json({ data: { ok: true, result } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST — run the safety scan now (it also runs every day). */
export async function POST(request: Request) {
  try {
    await requireAdmin(request, "users.action");
    return NextResponse.json({ data: await scanSafety() });
  } catch (error) {
    return toErrorResponse(error);
  }
}
