import { createHmac } from "node:crypto";
import { getServerEnv } from "@/src/lib/env";
import { getDb } from "@/src/server/db";
import { adminEmails, isAdmin } from "@/src/server/admin";
import { revokeAllSessions } from "@/src/server/auth";
import { sendAccountSuspended } from "@/src/server/admin-emails";
import { clientKey } from "@/src/server/rate-limit";
import { BackendError } from "@/src/server/errors";

/**
 * Safety guard. Plain rules, no AI: it acts on its own only when the
 * evidence is clear-cut (account farms, repeated harmful prompts) and flags
 * everything else for a person in Admin → Safety. Every automatic action is
 * written on the flag and can be undone.
 */

/** One-way fingerprint of the sign-up network: lets us group accounts without keeping IP addresses. */
export function networkFingerprint(request: Request): string | null {
  const secret = getServerEnv().JWT_SECRET;
  const ip = clientKey(request);
  if (!secret || !ip || ip.endsWith("unknown")) return null;
  return createHmac("sha256", secret).update(`signup-net:${ip}`).digest("base64url").slice(0, 22);
}

export async function recordSignupNetwork(userId: string, request: Request): Promise<void> {
  const fp = networkFingerprint(request);
  const db = getDb();
  if (!fp || !db) return;
  await db`UPDATE users SET signup_fp = ${fp} WHERE id = ${userId} AND signup_fp IS NULL`.catch(() => undefined);
}

export async function flag(f: { userId: string | null; kind: string; severity: "low" | "medium" | "high"; evidence: string; autoAction?: string; dedupe: string }): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const rows = await db`
    INSERT INTO safety_flags (user_id, kind, severity, evidence, auto_action, dedupe_key, status)
    VALUES (${f.userId}, ${f.kind}, ${f.severity}, ${f.evidence.slice(0, 1000)}, ${f.autoAction ?? ""}, ${f.dedupe}, ${f.autoAction ? "actioned" : "open"})
    ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`;
  return rows.length > 0;
}

async function autoSuspend(userId: string, email: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  if (isAdmin({ email, emailVerifiedAt: "y", status: "active" })) return false; // never admins
  const rows = await db`UPDATE users SET status = 'suspended', updated_at = now() WHERE id = ${userId} AND status = 'active' RETURNING id`;
  if (!rows.length) return false;
  await revokeAllSessions(userId).catch(() => undefined);
  await sendAccountSuspended(email);
  return true;
}

/* ---------------- Harmful prompts (checked on every generation request) ---------------- */

const MINOR = /\b(child|children|kid|kids|minor|minors|underage|under-age|preteen|pre-teen|toddler|schoolgirl|schoolboy|loli|(1[0-7]|[1-9])\s*(yo|y\/o|years?\s*old))\b/i;
// Pictures/video: anything sexual or nude. Scripts: only unambiguous porn words
// (so "sex education for kids" or "toddler bath time" scripts aren't blocked).
const SEXUAL_VISUAL = /\b(nude|nudity|naked|sexy|sexual|sexualized|porn\w*|explicit|nsfw|erotic\w*|seductive|lingerie|topless|genitals?)\b/i;
const SEXUAL_TEXT = /\b(porn\w*|erotic\w*|nsfw|sexual acts?|sexually explicit|fetish\w*)\b/i;

/** True for prompts that sexualise minors. Blocked always; repeat attempts suspend the account. */
export function isChildAbusePrompt(text: string, mode: "visual" | "text" = "visual"): boolean {
  const t = text.slice(0, 12000);
  return MINOR.test(t) && (mode === "visual" ? SEXUAL_VISUAL : SEXUAL_TEXT).test(t);
}

/** Call before any generation with user-written text. Throws a friendly error when blocked. */
export async function screenPrompt(user: { id: string; email: string }, text: string, mode: "visual" | "text" = "visual"): Promise<void> {
  if (!isChildAbusePrompt(text, mode)) return;
  const db = getDb();
  let suspended = false;
  if (db) {
    await flag({ userId: user.id, kind: "harmful_prompt", severity: "high", evidence: `Blocked a prompt sexualising minors: “${text.slice(0, 160)}”`, dedupe: `harmful:${user.id}:${Date.now()}` });
    const [c] = await db`SELECT count(*) AS n FROM safety_flags WHERE user_id = ${user.id} AND kind = 'harmful_prompt' AND created_at > now() - interval '30 days'`;
    if (Number(c?.n ?? 0) >= 2) {
      suspended = await autoSuspend(user.id, user.email);
      if (suspended) await flag({ userId: user.id, kind: "harmful_prompt", severity: "high", evidence: "Repeated prompts sexualising minors.", autoAction: "Account suspended automatically", dedupe: `harmful-suspend:${user.id}` });
    }
  }
  throw new BackendError("FORBIDDEN", suspended ? "Your account has been suspended." : "This request breaks our rules and was blocked. Content sexualising minors is never allowed.");
}

/* ---------------- Daily scan ---------------- */

export async function scanSafety(): Promise<Record<string, number>> {
  const db = getDb();
  if (!db) return {};
  const out = { farms: 0, suspended: 0, selfReferrals: 0, affiliateSelf: 0, affiliateFarms: 0, heavy: 0 };

  // 1. Account farms: many accounts from one network in 3 days.
  const groups = await db`
    SELECT signup_fp, array_agg(id ORDER BY created_at) AS ids, array_agg(email ORDER BY created_at) AS emails,
           count(*) AS n, count(*) FILTER (WHERE created_at > now() - interval '1 day') AS n24
    FROM users WHERE signup_fp IS NOT NULL AND deleted_at IS NULL AND created_at > now() - interval '3 days'
    GROUP BY signup_fp HAVING count(*) >= 4`;
  for (const g of groups) {
    const ids = (g.ids as string[]).map(String);
    const emails = (g.emails as string[]).map(String);
    out.farms++;
    // Mobile networks put many real people behind one address, so a burst
    // alone never suspends anyone. Clear-cut farming = 5+ in one day AND the
    // extra account claimed a free reward (invite bonus or bonus code).
    const burst = Number(g.n24) >= 5;
    for (let i = 1; i < ids.length; i++) {
      const [claimed] = burst
        ? await db`SELECT (EXISTS (SELECT 1 FROM referrals WHERE referred_id = ${ids[i]}) OR EXISTS (SELECT 1 FROM promo_redemptions WHERE user_id = ${ids[i]})) AS yes`
        : [{ yes: false }];
      const clearCut = burst && Boolean(claimed?.yes);
      const did = clearCut && (await autoSuspend(ids[i], emails[i]));
      if (did) out.suspended++;
      await db`UPDATE referrals SET status = 'blocked' WHERE referred_id = ${ids[i]} AND status = 'pending'`;
      await flag({
        userId: ids[i],
        kind: "account_farm",
        severity: clearCut ? "high" : "medium",
        evidence: `${Number(g.n)} accounts signed up from the same network in 3 days (${emails.slice(0, 6).join(", ")}${emails.length > 6 ? "…" : ""}).`,
        autoAction: did ? "Suspended automatically; pending referral reward blocked" : "",
        dedupe: `farm:${ids[i]}`,
      });
    }
  }

  // 2. Self-referrals: inviter and invitee on the same network.
  const selfRefs = await db`
    SELECT r.id, r.status, a.id AS referrer, a.email AS referrer_email, b.id AS referred, b.email AS referred_email
    FROM referrals r JOIN users a ON a.id = r.referrer_id JOIN users b ON b.id = r.referred_id
    WHERE a.signup_fp IS NOT NULL AND a.signup_fp = b.signup_fp AND r.created_at > now() - interval '30 days'`;
  for (const r of selfRefs) {
    const blocked = r.status === "pending";
    if (blocked) await db`UPDATE referrals SET status = 'blocked' WHERE id = ${String(r.id)} AND status = 'pending'`;
    if (await flag({ userId: String(r.referrer), kind: "self_referral", severity: "medium", evidence: `Invited ${String(r.referred_email)} from the same network${r.status === "rewarded" ? " — the reward was already paid" : ""}.`, autoAction: blocked ? "Referral reward blocked" : "", dedupe: `selfref:${String(r.id)}` })) out.selfReferrals++;
  }

  // 3. Affiliates earning from their own accounts: remove the attribution.
  const affSelf = await db`
    SELECT u.id, u.email, a.id AS aff, o.email AS owner_email FROM users u JOIN affiliates a ON a.id = u.affiliate_id JOIN users o ON o.id = a.user_id
    WHERE u.signup_fp IS NOT NULL AND u.signup_fp = o.signup_fp`;
  for (const r of affSelf) {
    await db`UPDATE users SET affiliate_id = NULL WHERE id = ${String(r.id)}`;
    if (await flag({ userId: String(r.id), kind: "affiliate_self", severity: "medium", evidence: `Signed up through ${String(r.owner_email)}'s affiliate link from the affiliate's own network.`, autoAction: "Affiliate credit removed", dedupe: `affself:${String(r.id)}` })) out.affiliateSelf++;
  }

  // 4. Affiliates whose sign-ups all come from one or two networks.
  const affFarms = await db`
    SELECT a.id, o.id AS owner, o.email, count(*) AS n, count(DISTINCT u.signup_fp) AS nets
    FROM affiliates a JOIN users o ON o.id = a.user_id JOIN users u ON u.affiliate_id = a.id
    WHERE a.status = 'approved' AND u.signup_fp IS NOT NULL GROUP BY a.id, o.id, o.email HAVING count(*) >= 8 AND count(DISTINCT u.signup_fp) <= 2`;
  for (const r of affFarms) {
    if (await flag({ userId: String(r.owner), kind: "affiliate_farm", severity: "high", evidence: `${Number(r.n)} affiliate sign-ups from only ${Number(r.nets)} network(s). Check before paying commission.`, dedupe: `afffarm:${String(r.id)}:${Number(r.n)}` })) out.affiliateFarms++;
  }

  // 5. Unusually heavy use (possible scripting or a shared account).
  const heavy = await db`
    SELECT u.id, u.email, count(*) AS n FROM usage_events e JOIN users u ON u.id = e.user_id
    WHERE e.created_at > now() - interval '1 day' GROUP BY u.id, u.email HAVING count(*) > 250`;
  for (const r of heavy) {
    if (isAdmin({ email: String(r.email), emailVerifiedAt: "y", status: "active" })) continue;
    if (await flag({ userId: String(r.id), kind: "heavy_use", severity: "low", evidence: `${Number(r.n)} generations in 24 hours.`, dedupe: `heavy:${String(r.id)}:${new Date().toISOString().slice(0, 10)}` })) out.heavy++;
  }
  return out;
}

/** Who gets safety and health alerts. */
export const alertRecipients = () => adminEmails();
