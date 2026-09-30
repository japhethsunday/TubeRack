import { randomBytes } from "node:crypto";
import { getDb } from "@/src/server/db";
import { adjustCredits } from "@/src/server/credits";
import { validationError } from "@/src/server/errors";

/** Bonus credit codes: public (CREATOR50) or personal (tied to one account, sent in offer emails). */

export const normalizeCode = (c: string) => c.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");

export async function redeemCode(userId: string, workspaceId: string, raw: string): Promise<{ credits: number; balance: number | null }> {
  const code = normalizeCode(raw);
  if (code.length < 3) throw validationError("Enter a valid code.");
  const db = getDb();
  if (!db) throw validationError("Codes aren't available right now.");
  // One atomic claim: counts the use only if the code is valid for this person.
  const claimed = await db.begin(async (tx) => {
    const [c] = await tx`SELECT * FROM promo_codes WHERE code = ${code} FOR UPDATE`;
    if (!c || !c.active) throw validationError("That code isn't valid.");
    if (c.expires_at && new Date(String(c.expires_at)).getTime() < Date.now()) throw validationError("That code has expired.");
    if (c.user_id && String(c.user_id) !== userId) throw validationError("That code belongs to another account.");
    if (c.max_uses !== null && Number(c.uses) >= Number(c.max_uses)) throw validationError("That code has been fully used.");
    const ins = await tx`INSERT INTO promo_redemptions (code, user_id, workspace_id, credits) VALUES (${code}, ${userId}, ${workspaceId}, ${Number(c.credits)}) ON CONFLICT DO NOTHING RETURNING code`;
    if (!ins.length) throw validationError("You've already used this code.");
    await tx`UPDATE promo_codes SET uses = uses + 1 WHERE code = ${code}`;
    return Number(c.credits);
  });
  const state = await adjustCredits(workspaceId, claimed, `Code ${code}`, "promo:code");
  return { credits: claimed, balance: state?.unlimited ? null : state?.balance ?? null };
}

/** A one-person code for an offer email, e.g. BONUS-7K3Q9P. */
export async function personalCode(userId: string, credits: number, hours: number, note: string): Promise<{ code: string; expiresAt: Date }> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  const expiresAt = new Date(Date.now() + hours * 3600_000);
  for (let i = 0; i < 5; i++) {
    const code = `BONUS-${randomBytes(4).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6).padEnd(6, "X")}`;
    const rows = await db`
      INSERT INTO promo_codes (code, credits, note, expires_at, max_uses, user_id)
      VALUES (${code}, ${credits}, ${note.slice(0, 200)}, ${expiresAt}, 1, ${userId}) ON CONFLICT DO NOTHING RETURNING code`;
    if (rows.length) return { code, expiresAt };
  }
  throw new Error("Couldn't create a code");
}

/** Cookie holding a bonus code entered at sign-up (or from a ?bonus= link) until the account exists. */
export const BONUS_COOKIE = "rt_bonus";

/** Preview a code on the sign-up page: how many credits, or why it won't work. Personal codes stay private. */
export async function checkCode(raw: string): Promise<{ ok: true; credits: number } | { ok: false; message: string }> {
  const code = normalizeCode(raw);
  if (code.length < 3) return { ok: false, message: "Enter a valid code." };
  const db = getDb();
  if (!db) return { ok: false, message: "Codes aren't available right now." };
  const [c] = await db`SELECT credits, active, expires_at, max_uses, uses, user_id FROM promo_codes WHERE code = ${code}`;
  if (!c || !c.active || c.user_id) return { ok: false, message: "That code isn't valid." };
  if (c.expires_at && new Date(String(c.expires_at)).getTime() < Date.now()) return { ok: false, message: "That code has expired." };
  if (c.max_uses !== null && Number(c.uses) >= Number(c.max_uses)) return { ok: false, message: "That code has been fully used." };
  return { ok: true, credits: Number(c.credits) };
}

/** Redeem a sign-up bonus code for a brand-new account. Never blocks sign-up. */
export async function redeemAtSignup(userId: string, raw: string | undefined | null): Promise<number> {
  if (!raw || normalizeCode(raw).length < 3) return 0;
  const db = getDb();
  if (!db) return 0;
  try {
    const [w] = await db`SELECT id FROM workspaces WHERE owner_id = ${userId} ORDER BY created_at ASC LIMIT 1`;
    if (!w) return 0;
    return (await redeemCode(userId, String(w.id), raw)).credits;
  } catch (error) {
    console.warn("sign-up bonus code not applied:", error instanceof Error ? error.message : String(error));
    return 0;
  }
}

/* ---------- Admin: create, list and delete codes ---------- */

export type CodeKind = "group" | "individual";

export interface AdminCode {
  code: string;
  kind: CodeKind;
  credits: number;
  note: string;
  forEmail: string | null;
  maxUses: number | null;
  uses: number;
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
  /** "Active", "Redeemed" (individual, used), "Fully used", "Expired" or "Off". */
  status: string;
  redemptions: { email: string; at: string }[];
}

/** A readable random code, e.g. GIFT-7K3Q9P. */
function randomCode(prefix: string): string {
  return `${prefix}-${randomBytes(6).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6).padEnd(6, "X")}`;
}

/**
 * Create a code. Group: anyone can use it once, up to `maxUses` people
 * (null = unlimited). Individual: only the account with that email can use it, once.
 */
export async function createAdminCode(input: { kind: CodeKind; credits: number; code?: string; email?: string; maxUses?: number | null; days?: number | null; note?: string; createdBy: string }): Promise<{ code: string; forEmail: string | null }> {
  const db = getDb();
  if (!db) throw validationError("Codes aren't available right now.");
  let userId: string | null = null;
  let forEmail: string | null = null;
  if (input.kind === "individual") {
    const email = (input.email ?? "").trim().toLowerCase();
    if (!email) throw validationError("Add the email of the person this code is for.");
    const [u] = await db`SELECT id, email FROM users WHERE lower(email) = ${email} AND deleted_at IS NULL LIMIT 1`;
    if (!u) throw validationError(`No account uses ${email}. They need to sign up first.`);
    userId = String(u.id);
    forEmail = String(u.email);
  }
  const maxUses = input.kind === "individual" ? 1 : input.maxUses ?? null;
  const expires = input.days ? new Date(Date.now() + input.days * 86_400_000) : null;
  const wanted = normalizeCode(input.code ?? "");
  if (wanted && wanted.length < 3) throw validationError("Use 3–32 letters, numbers, - or _.");
  for (let i = 0; i < 5; i++) {
    const code = wanted || randomCode(input.kind === "individual" ? "GIFT" : "BONUS");
    const rows = await db`
      INSERT INTO promo_codes (code, credits, note, expires_at, max_uses, user_id, created_by)
      VALUES (${code}, ${input.credits}, ${(input.note ?? "").slice(0, 200)}, ${expires}, ${maxUses}, ${userId}, ${input.createdBy})
      ON CONFLICT DO NOTHING RETURNING code`;
    if (rows.length) return { code, forEmail };
    if (wanted) throw validationError("That code already exists.");
  }
  throw validationError("Couldn't create a code. Try again.");
}

function statusOf(c: { active: boolean; expiresAt: string | null; maxUses: number | null; uses: number; kind: CodeKind }): string {
  if (!c.active) return "Off";
  if (c.kind === "individual" && c.uses > 0) return "Redeemed";
  if (c.maxUses !== null && c.uses >= c.maxUses) return "Fully used";
  if (c.expiresAt && new Date(c.expiresAt).getTime() < Date.now()) return "Expired";
  return "Active";
}

/** Every code with who redeemed it and when (newest first). */
export async function listAdminCodes(limit = 200): Promise<AdminCode[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db`
    SELECT c.code, c.credits, c.note, c.expires_at, c.max_uses, c.uses, c.active, c.created_at, c.user_id, u.email AS for_email,
      coalesce((SELECT json_agg(json_build_object('email', ru.email, 'at', r.created_at) ORDER BY r.created_at DESC)
                FROM (SELECT * FROM promo_redemptions WHERE code = c.code ORDER BY created_at DESC LIMIT 20) r
                JOIN users ru ON ru.id = r.user_id), '[]') AS redemptions
    FROM promo_codes c LEFT JOIN users u ON u.id = c.user_id
    ORDER BY c.created_at DESC LIMIT ${limit}`;
  return rows.map((r) => {
    const base = {
      code: String(r.code),
      kind: (r.user_id ? "individual" : "group") as CodeKind,
      credits: Number(r.credits),
      note: String(r.note ?? ""),
      forEmail: r.for_email ? String(r.for_email) : null,
      maxUses: r.max_uses === null ? null : Number(r.max_uses),
      uses: Number(r.uses),
      active: Boolean(r.active),
      expiresAt: r.expires_at ? new Date(String(r.expires_at)).toISOString() : null,
      createdAt: new Date(String(r.created_at)).toISOString(),
      redemptions: ((r.redemptions as { email: string; at: string }[]) ?? []).map((x) => ({ email: String(x.email), at: new Date(x.at).toISOString() })),
    };
    return { ...base, status: statusOf(base) };
  });
}

/** Delete a code. Credits people already received are kept; its redemption history is removed with it. */
export async function deleteAdminCode(raw: string): Promise<{ code: string; uses: number }> {
  const db = getDb();
  if (!db) throw validationError("Codes aren't available right now.");
  const code = normalizeCode(raw);
  const rows = await db`DELETE FROM promo_codes WHERE code = ${code} RETURNING code, uses`;
  if (!rows.length) throw validationError(`There's no code ${code}.`);
  return { code, uses: Number(rows[0].uses) };
}
