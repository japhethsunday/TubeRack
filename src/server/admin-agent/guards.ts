import { adminDb } from "@/src/server/admin";
import { validationError } from "@/src/server/errors";

/**
 * Hard safety rules for the admin assistant, enforced in code (not the prompt):
 * risky batches need a typed CONFIRM, credit "reversals" need a real grant to
 * reverse, and emails can't claim credits that were never given.
 */

export const HIGH_IMPACT_ACCOUNTS = 3;
export const HIGH_IMPACT_CREDITS = 500;

const CREDIT_ACTIONS = new Set(["give_credits", "remove_credits", "set_monthly_plan", "set_unlimited"]);

/** Which proposals in one reply need a typed CONFIRM. */
export function highImpact(proposals: { name: string; args: Record<string, unknown> }[]): boolean[] {
  const credit = proposals.filter((p) => CREDIT_ACTIONS.has(p.name));
  const total = credit.reduce((n, p) => n + Math.abs(Number(p.args.amount ?? p.args.monthly ?? 0)), 0);
  const batch = credit.length > HIGH_IMPACT_ACCOUNTS || total > HIGH_IMPACT_CREDITS;
  return proposals.map((p) => {
    if (p.name === "email_everyone" || p.name === "remove_credits" || p.name === "set_unlimited" || p.name === "delete_promo_videos") return true;
    if (p.name === "give_credits" && Number(p.args.amount) > HIGH_IMPACT_CREDITS) return true;
    return batch && CREDIT_ACTIONS.has(p.name);
  });
}

/** Text that tells people credits were put in their account. */
export function claimsCreditsAdded(text: string): boolean {
  return text
    .replace(/\s+/g, " ")
    .split(/[.!?\n]+/)
    .some((s) => {
      // "no credits were added" / "weren't added" is a correction, not a claim.
      if (/\b(no|not|never|weren't|wasn't|haven't|hasn't|didn't)\b/i.test(s)) return false;
      return (
        /\b(added|credited|gifted|topped up|deposited|loaded)\b.{0,60}\bcredits?\b/i.test(s) ||
        /\bcredits?\b.{0,40}\b(added|credited|gifted|deposited|loaded)\b/i.test(s) ||
        /\b(you|you've|you have) (got|received|been given)\b.{0,40}\bcredits?\b/i.test(s)
      );
    });
}

const REVERSAL = /\b(revers|undo|undoing|accident|mistake|wrong|by error|in error|roll ?back|take back)/i;

/** Workspace owned by this email, or null. */
async function workspaceOf(email: string): Promise<string | null> {
  const [w] = await adminDb()`
    SELECT m.workspace_id FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE lower(u.email) = ${email.toLowerCase()} AND u.deleted_at IS NULL
    ORDER BY (m.role = 'owner') DESC, m.created_at ASC LIMIT 1`;
  return w ? String(w.workspace_id) : null;
}

/** Credits granted to this account by the team (admin, bulk, codes) in the last `days`. */
async function grantedRecently(workspaceId: string, days: number): Promise<number> {
  const [r] = await adminDb()`
    SELECT coalesce(sum(t.amount), 0) AS n FROM credit_transactions t JOIN credit_accounts c ON c.id = t.account_id
    WHERE c.workspace_id = ${workspaceId} AND t.amount > 0 AND (t.kind LIKE 'admin:%' OR t.kind LIKE 'promo:%')
      AND t.created_at > now() - make_interval(days => ${days})`;
  return Number(r?.n ?? 0);
}

/** Throws with a plain explanation when an action breaks a safety rule. */
export async function checkAction(name: string, a: Record<string, unknown>): Promise<void> {
  if (name === "remove_credits" && REVERSAL.test(String(a.reason ?? ""))) {
    const ws = await workspaceOf(String(a.email));
    const granted = ws ? await grantedRecently(ws, 7) : 0;
    if (granted < Number(a.amount)) {
      throw validationError(
        granted
          ? `Blocked: this "reversal" removes ${a.amount} credits, but only ${granted} were given to ${a.email} in the last 7 days. Remove at most ${granted}.`
          : `Blocked: nothing was given to ${a.email} in the last 7 days, so there is nothing to reverse. Their credits were not touched.`,
      );
    }
  }
  if (name === "send_email" && claimsCreditsAdded(`${a.subject} ${a.message}`)) {
    const ws = await workspaceOf(String(a.email));
    const [r] = ws
      ? await adminDb()`SELECT 1 FROM credit_transactions t JOIN credit_accounts c ON c.id = t.account_id WHERE c.workspace_id = ${ws} AND t.amount > 0 AND t.created_at > now() - interval '2 hours' LIMIT 1`
      : [];
    if (!r) throw validationError(`Blocked: this email says credits were added, but ${a.email} hasn't been given any in the last 2 hours. Give the credits first, then send it.`);
  }
  if (name === "email_everyone" && claimsCreditsAdded(`${a.subject} ${a.message}`)) {
    const [r] = await adminDb()`SELECT 1 FROM audit_log WHERE action = 'admin.credits.bulk' AND created_at > now() - interval '2 hours' LIMIT 1`;
    if (!r) throw validationError("Blocked: this email tells everyone credits were added, but no credits were given to everyone. Emails don't add credits. Use Bulk credits first, then send it.");
  }
}
