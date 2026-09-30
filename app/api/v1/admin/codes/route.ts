import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb, requireAdmin } from "@/src/server/admin";
import { createAdminCode, deleteAdminCode, listAdminCodes, normalizeCode } from "@/src/server/growth/codes";
import { audit } from "@/src/server/audit";
import { toErrorResponse, validationError } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const dynamic = "force-dynamic";

/** GET /api/v1/admin/codes — every code (group and individual) with who redeemed it. */
export async function GET(request: Request) {
  try {
    await requireAdmin(request, "credits.list");
    return NextResponse.json({ data: { codes: await listAdminCodes() } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const createBody = z.object({
  kind: z.enum(["group", "individual"]).default("group"),
  /** Empty: a random code is made. */
  code: z.string().trim().max(32).default(""),
  email: z.string().trim().max(254).default(""),
  credits: z.number().int().min(1).max(100_000),
  note: z.string().trim().max(200).default(""),
  expiresInDays: z.number().int().min(1).max(365).nullable().default(null),
  maxUses: z.number().int().min(1).max(1_000_000).nullable().default(null),
});

/** POST /api/v1/admin/codes — create a group code (N people) or an individual code (one account). */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request, "credits.change");
    const b = await parseBody(request, createBody);
    const out = await createAdminCode({ kind: b.kind, code: b.code, email: b.email, credits: b.credits, note: b.note, days: b.expiresInDays, maxUses: b.maxUses, createdBy: admin.id });
    await audit({ userId: admin.id, action: "admin.codes.create", metadata: { code: out.code, credits: b.credits, kind: b.kind } });
    return NextResponse.json({ data: out });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** DELETE /api/v1/admin/codes?code=X — delete a code (credits already given are kept). */
export async function DELETE(request: Request) {
  try {
    const admin = await requireAdmin(request, "credits.change");
    const out = await deleteAdminCode(new URL(request.url).searchParams.get("code") ?? "");
    await audit({ userId: admin.id, action: "admin.codes.delete", metadata: out });
    return NextResponse.json({ data: out });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const patchBody = z.object({ code: z.string().trim().min(3).max(32), active: z.boolean() });

/** PATCH /api/v1/admin/codes — turn a code on or off. */
export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin(request, "credits.change");
    const b = await parseBody(request, patchBody);
    await adminDb()`UPDATE promo_codes SET active = ${b.active} WHERE code = ${normalizeCode(b.code)}`;
    await audit({ userId: admin.id, action: "admin.codes.toggle", metadata: { code: b.code, active: b.active } });
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
