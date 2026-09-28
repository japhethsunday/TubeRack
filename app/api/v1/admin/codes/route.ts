import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb, requireAdmin } from "@/src/server/admin";
import { normalizeCode } from "@/src/server/growth/codes";
import { audit } from "@/src/server/audit";
import { toErrorResponse, validationError } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const dynamic = "force-dynamic";

/** GET /api/v1/admin/codes — public codes and a summary of personal ones. */
export async function GET(request: Request) {
  try {
    await requireAdmin(request, "credits.list");
    const db = adminDb();
    const codes = await db`SELECT code, credits, note, expires_at, max_uses, uses, active, created_at FROM promo_codes WHERE user_id IS NULL ORDER BY created_at DESC LIMIT 200`;
    const [personal] = await db`SELECT count(*) AS made, coalesce(sum(uses), 0) AS used FROM promo_codes WHERE user_id IS NOT NULL`;
    return NextResponse.json({
      data: {
        codes: codes.map((c) => ({ code: String(c.code), credits: Number(c.credits), note: String(c.note), expiresAt: c.expires_at ? new Date(String(c.expires_at)).toISOString() : null, maxUses: c.max_uses === null ? null : Number(c.max_uses), uses: Number(c.uses), active: Boolean(c.active), createdAt: new Date(String(c.created_at)).toISOString() })),
        personal: { made: Number(personal?.made ?? 0), used: Number(personal?.used ?? 0) },
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const createBody = z.object({
  code: z.string().trim().min(3).max(32),
  credits: z.number().int().min(1).max(100_000),
  note: z.string().trim().max(200).default(""),
  expiresInDays: z.number().int().min(1).max(365).nullable().default(null),
  maxUses: z.number().int().min(1).max(1_000_000).nullable().default(null),
});

/** POST /api/v1/admin/codes — create a public code. */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request, "credits.change");
    const b = await parseBody(request, createBody);
    const code = normalizeCode(b.code);
    if (code.length < 3) throw validationError("Use 3–32 letters, numbers, - or _.");
    const expires = b.expiresInDays ? new Date(Date.now() + b.expiresInDays * 86_400_000) : null;
    const rows = await adminDb()`
      INSERT INTO promo_codes (code, credits, note, expires_at, max_uses, created_by)
      VALUES (${code}, ${b.credits}, ${b.note}, ${expires}, ${b.maxUses}, ${admin.id}) ON CONFLICT DO NOTHING RETURNING code`;
    if (!rows.length) throw validationError("That code already exists.");
    await audit({ userId: admin.id, action: "admin.codes.create", metadata: { code, credits: b.credits } });
    return NextResponse.json({ data: { code } });
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
