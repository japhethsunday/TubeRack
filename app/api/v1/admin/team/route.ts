import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb, adminEmails, requireAdmin } from "@/src/server/admin";
import { listTeam } from "@/src/server/admin-ops";
import { audit } from "@/src/server/audit";
import { toErrorResponse, validationError } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const dynamic = "force-dynamic";

/** GET /api/v1/admin/team — owners and team members with their roles. */
export async function GET(request: Request) {
  try {
    await requireAdmin(request, "team.view");
    return NextResponse.json({ data: { owners: adminEmails(), members: await listTeam() } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const body = z.object({ email: z.string().trim().toLowerCase().email().max(254), role: z.enum(["support", "finance", "operations"]) });

/** POST /api/v1/admin/team — add or change a team member (owner only). */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request, "team.edit");
    const { email, role } = await parseBody(request, body);
    if (adminEmails().includes(email)) throw validationError("That address is already an owner.");
    await adminDb()`
      INSERT INTO admin_members (email, role, added_by) VALUES (${email}, ${role}, ${admin.id})
      ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role`;
    await audit({ userId: admin.id, action: "admin.team.set", metadata: { email, role } });
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** DELETE /api/v1/admin/team?email= — remove a team member. */
export async function DELETE(request: Request) {
  try {
    const admin = await requireAdmin(request, "team.edit");
    const email = (new URL(request.url).searchParams.get("email") ?? "").trim().toLowerCase();
    if (!email) throw validationError("Which member?");
    await adminDb()`DELETE FROM admin_members WHERE email = ${email}`;
    await audit({ userId: admin.id, action: "admin.team.remove", metadata: { email } });
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
