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
