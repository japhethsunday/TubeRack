import { randomInt } from "node:crypto";
import { getDb } from "@/src/server/db";
import { adjustCredits } from "@/src/server/credits";

/**
 * Referrals and signup attribution.
 * - Landing on the site with ?ref=CODE or ?utm_source/utm_campaign sets
 *   first-party cookies (see proxy.ts); sign-up reads them once.
 * - A referral pays out only when the NEW account verifies its email, so
 *   throwaway sign-ups earn nothing. Referrers are capped.
 */

export const REFERRAL_REWARD = 100;
export const MAX_REWARDED_REFERRALS = 50;
export const ATTR_COOKIES = { ref: "rt_ref", source: "rt_src", campaign: "rt_cmp" } as const;

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const CODE = /^[A-Z2-9]{6,12}$/;

export const clean = (v: string | undefined | null, n = 60) => (v ?? "").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, n);
export const cleanCode = (v: string | undefined | null) => {
  const c = (v ?? "").toUpperCase().trim();
  return CODE.test(c) ? c : "";
};

function newCode(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

/** The user's referral code, created on first use. */
export async function ensureReferralCode(userId: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const [u] = await db`SELECT referral_code FROM users WHERE id = ${userId}`;
  if (u?.referral_code) return String(u.referral_code);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [r] = await db`UPDATE users SET referral_code = ${newCode()} WHERE id = ${userId} AND referral_code IS NULL RETURNING referral_code`;
      if (r) return String(r.referral_code);
      const [again] = await db`SELECT referral_code FROM users WHERE id = ${userId}`;
      if (again?.referral_code) return String(again.referral_code);
    } catch {
      // unique collision: try another code
    }
  }
  return null;
}

/** The workspace a user owns (credits live there). */
async function ownedWorkspace(userId: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const [w] = await db`SELECT workspace_id FROM memberships WHERE user_id = ${userId} ORDER BY (role = 'owner') DESC, created_at ASC LIMIT 1`;
  return w ? String(w.workspace_id) : null;
}

/** Record where a new account came from and who invited it (once, at sign-up). */
export async function attributeSignup(userId: string, attr: { ref?: string; source?: string; campaign?: string; marketing?: boolean }): Promise<void> {
  const db = getDb();
  if (!db) return;
  const code = cleanCode(attr.ref);
  let referrer: string | null = null;
  if (code) {
    const [r] = await db`SELECT id FROM users WHERE referral_code = ${code} AND deleted_at IS NULL AND status = 'active' LIMIT 1`;
    if (r && String(r.id) !== userId) referrer = String(r.id);
  }
  const source = clean(attr.source) || (referrer ? "referral" : "");
  await db`
    UPDATE users SET
      signup_source = ${source},
      signup_campaign = ${clean(attr.campaign)},
      referred_by = ${referrer},
      marketing_opt_in = ${Boolean(attr.marketing)},
      marketing_opt_in_at = ${attr.marketing ? new Date().toISOString() : null}
    WHERE id = ${userId}`;
  if (referrer) await db`INSERT INTO referrals (referrer_id, referred_id) VALUES (${referrer}, ${userId}) ON CONFLICT (referred_id) DO NOTHING`;
}

/** Pay a pending referral once the invited account is verified. Idempotent. */
export async function rewardReferral(userId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const [ref] = await db`
    UPDATE referrals SET status = 'rewarded', reward = ${REFERRAL_REWARD}, rewarded_at = now()
    WHERE referred_id = ${userId} AND status = 'pending'
      AND (SELECT count(*) FROM referrals r2 WHERE r2.referrer_id = referrals.referrer_id AND r2.status = 'rewarded') < ${MAX_REWARDED_REFERRALS}
    RETURNING referrer_id`;
  if (!ref) return false;
  const [newWs, refWs] = await Promise.all([ownedWorkspace(userId), ownedWorkspace(String(ref.referrer_id))]);
  if (newWs) await adjustCredits(newWs, REFERRAL_REWARD, "Referral bonus: welcome gift", "referral").catch(() => null);
  if (refWs) await adjustCredits(refWs, REFERRAL_REWARD, "Referral bonus: a friend joined", "referral").catch(() => null);
  return true;
}

export async function referralSummary(userId: string, appUrl: string) {
  const db = getDb();
  const code = await ensureReferralCode(userId);
  if (!db || !code) return null;
  const [s] = await db`
    SELECT count(*) AS invited, count(*) FILTER (WHERE status = 'rewarded') AS rewarded, coalesce(sum(reward), 0) AS earned
    FROM referrals WHERE referrer_id = ${userId}`;
  return {
    code,
    link: `${appUrl.replace(/\/$/, "")}/signup?ref=${code}`,
    invited: Number(s?.invited ?? 0),
    joined: Number(s?.rewarded ?? 0),
    creditsEarned: Number(s?.earned ?? 0),
    reward: REFERRAL_REWARD,
    remaining: Math.max(0, MAX_REWARDED_REFERRALS - Number(s?.rewarded ?? 0)),
  };
}
