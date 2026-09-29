import { getServerEnv } from "@/src/lib/env";
import { renderEmail, type EmailBlock } from "@/src/server/email-templates";
import { sendEmail } from "@/src/server/email";
import { getDb } from "@/src/server/db";
import { ROLE_LABELS } from "@/src/lib/admin-roles";

const ADMIN_ROLES_LABEL: Record<string, string> = Object.fromEntries(Object.entries(ROLE_LABELS).map(([k, v]) => [k, v.label]));

/**
 * Emails for everything the team does that affects a person: admin team
 * changes, account actions and the affiliate program. Account mail (not
 * marketing), best effort — the admin action never waits on or fails with it.
 */

const app = () => getServerEnv().APP_URL.replace(/\/$/, "");

async function firstName(email: string): Promise<string> {
  try {
    const db = getDb();
    if (!db) return "";
    const [u] = await db`SELECT name FROM users WHERE lower(email) = ${email.toLowerCase()} LIMIT 1`;
    return String(u?.name ?? "").trim().split(/\s+/)[0] ?? "";
  } catch {
    return "";
  }
}

async function send(
  to: string,
  m: { subject: string; preheader: string; eyebrow: string; heading: string; intro: string; blocks?: EmailBlock[]; cta?: { label: string; url: string }; reason: string; name?: string },
): Promise<boolean> {
  try {
    const first = m.name ?? (await firstName(to));
    const mail = renderEmail({
      preheader: m.preheader,
      eyebrow: m.eyebrow,
      heading: m.heading,
      intro: `${first ? `Hi ${first}, ` : ""}${m.intro}`,
      blocks: [...(m.blocks ?? []), { type: "text", text: "Questions? Just reply to this email.\n\nThe Recktube team" }],
      cta: m.cta,
      reason: m.reason,
      appUrl: app(),
    });
    const res = await sendEmail({ to, subject: m.subject, ...mail, kind: "account", fromName: "Recktube", fromAddress: "support@recktube.xyz", replyTo: "support@recktube.xyz" });
    return res.sent;
  } catch (error) {
    console.error("admin email failed:", error instanceof Error ? error.message : String(error));
    return false;
  }
}

/* ---------------- Admin team ---------------- */

const ROLE_BLURB: Record<string, string> = {
  support: "help creators: support chats, the inbox and user accounts",
  finance: "look after money: credits, codes, plans, revenue and affiliates",
  operations: "keep things running: generations, failed jobs, feature switches and system health",
};

export function sendTeamWelcome(email: string, role: string, isNew: boolean) {
  const label = ADMIN_ROLES_LABEL[role] ?? role;
  return send(email, {
    subject: isNew ? "Welcome to the Recktube admin team" : `Your Recktube admin role is now ${label}`,
    preheader: isNew ? `You've been added to the Recktube admin console as ${label}.` : `Your admin role changed to ${label}.`,
    eyebrow: "Admin team",
    heading: isNew ? "Welcome to the team" : "Your admin role changed",
    intro: isNew
      ? `you've been added to the Recktube admin console as ${label}. You'll ${ROLE_BLURB[role] ?? "help run Recktube"}.`
      : `your role in the Recktube admin console is now ${label}: you'll ${ROLE_BLURB[role] ?? "help run Recktube"}.`,
    blocks: [
      {
        type: "steps",
        items: [
          { title: "Sign in", text: `Use this email address (${email}) on recktube.xyz. No account yet? Create one with this address first.` },
          { title: "Open the console", text: "Go to recktube.xyz/admin — you'll only see the pages your role allows." },
          { title: "Keep it safe", text: "Use a strong password and never share your sign-in. Every admin action is recorded." },
        ],
      },
    ],
    cta: { label: "Open the admin console", url: `${app()}/admin` },
    reason: "You're receiving this because you were given access to the Recktube admin console.",
  });
}

export function sendTeamRemoved(email: string) {
  return send(email, {
    subject: "Your Recktube admin access has ended",
    preheader: "You no longer have access to the Recktube admin console.",
    eyebrow: "Admin team",
    heading: "Admin access removed",
    intro: "your access to the Recktube admin console has been removed. Your own Recktube account and projects are not affected. Thank you for your help.",
    reason: "You're receiving this because your Recktube admin access changed.",
  });
}

/* ---------------- Account actions ---------------- */

export function sendAccountSuspended(email: string) {
  return send(email, {
    subject: "Your Recktube account has been suspended",
    preheader: "Your account is paused. Reply to this email if you think this is a mistake.",
    eyebrow: "Account",
    heading: "Your account is suspended",
    intro: "the Recktube team has suspended your account, so you can't sign in or use the studio for now. Your projects are kept safe. If you think this is a mistake, reply to this email and we'll look into it.",
    reason: "You're receiving this because the status of your Recktube account changed.",
  });
}

export function sendAccountReactivated(email: string) {
  return send(email, {
    subject: "Your Recktube account is active again",
    preheader: "Welcome back — you can sign in again.",
    eyebrow: "Account",
    heading: "Welcome back",
    intro: "your Recktube account has been reactivated. You can sign in and pick up right where you left off.",
    cta: { label: "Sign in", url: `${app()}/login` },
    reason: "You're receiving this because the status of your Recktube account changed.",
  });
}

export function sendSignedOutEverywhere(email: string) {
  return send(email, {
    subject: "You've been signed out of Recktube on all devices",
    preheader: "For your security, all sessions were ended.",
    eyebrow: "Security",
    heading: "Signed out everywhere",
    intro: "for your security, the Recktube team signed your account out on every device. Just sign in again to continue. If you didn't expect this, change your password.",
    cta: { label: "Sign in", url: `${app()}/login` },
    reason: "You're receiving this because of a security action on your Recktube account.",
  });
}

export function sendEmailVerifiedByTeam(email: string) {
  return send(email, {
    subject: "Your Recktube email is confirmed",
    preheader: "The team confirmed your email address — you're all set.",
    eyebrow: "Account",
    heading: "Email confirmed",
    intro: "the Recktube team has confirmed your email address. Everything on your account is now unlocked.",
    cta: { label: "Open Recktube", url: `${app()}/dashboard` },
    reason: "You're receiving this because your Recktube account changed.",
  });
}

export function sendAccountDeleted(email: string, name: string) {
  return send(email, {
    name: name.trim().split(/\s+/)[0] ?? "",
    subject: "Your Recktube account has been deleted",
    preheader: "Your account and its data have been removed.",
    eyebrow: "Account",
    heading: "Account deleted",
    intro: "your Recktube account and the projects only you owned have been permanently deleted by the Recktube team. If you didn't ask for this, reply to this email.",
    reason: "You're receiving this because your Recktube account was deleted.",
  });
}

/** Verified, active owners of a workspace (who account mail about it goes to). */
export async function workspaceOwnerEmails(workspaceId: string): Promise<string[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db`
    SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.workspace_id = ${workspaceId} AND m.role = 'owner' AND u.email_verified_at IS NOT NULL AND u.status = 'active' AND u.deleted_at IS NULL`;
  return rows.map((r) => String(r.email));
}

export function sendPlanChanged(email: string, monthly: number) {
  return send(email, {
    subject: `Your Recktube plan now includes ${monthly.toLocaleString("en-US")} credits a month`,
    preheader: `Your monthly allowance is now ${monthly.toLocaleString("en-US")} credits.`,
    eyebrow: "Plan",
    heading: "Your plan changed",
    intro: `your Recktube monthly allowance is now ${monthly.toLocaleString("en-US")} credits, refilled every 30 days.`,
    cta: { label: "See my credits", url: `${app()}/settings?tab=billing` },
    reason: "You're receiving this because your Recktube plan changed.",
  });
}

/** A personal message from the team (written by an admin, or drafted by the assistant and approved). */
export function sendTeamMessage(email: string, subject: string, message: string) {
  return send(email, {
    subject: subject.slice(0, 140),
    preheader: message.slice(0, 110),
    eyebrow: "Message from the team",
    heading: subject.slice(0, 90),
    intro: message.slice(0, 4000),
    reason: "You're receiving this because the Recktube team sent you a message about your account.",
  });
}

/* ---------------- Affiliates ---------------- */

export function sendAffiliateStatus(email: string, status: string, code: string, pct: number) {
  const link = `${app()}/go/${code}`;
  if (status === "approved")
    return send(email, {
      subject: "You're in! Your Recktube affiliate link is ready",
      preheader: `Earn ${pct}% on every payment from creators you bring in.`,
      eyebrow: "Affiliate program",
      heading: "Welcome to the affiliate program",
      intro: `your application was approved. Share your link and earn ${pct}% commission on every payment from creators who sign up through it within 60 days of clicking.`,
      blocks: [{ type: "callout", title: "Your link", text: link }],
      cta: { label: "See my affiliate dashboard", url: `${app()}/invite` },
      reason: "You're receiving this because you applied to the Recktube affiliate program.",
    });
  if (status === "rejected")
    return send(email, {
      subject: "About your Recktube affiliate application",
      preheader: "Your application wasn't approved this time.",
      eyebrow: "Affiliate program",
      heading: "Application not approved",
      intro: "thank you for applying to the Recktube affiliate program. We can't approve your application right now. You can update it and apply again from the Invite page, and you can still earn credits by inviting friends.",
      cta: { label: "Open the Invite page", url: `${app()}/invite` },
      reason: "You're receiving this because you applied to the Recktube affiliate program.",
    });
  if (status === "paused")
    return send(email, {
      subject: "Your Recktube affiliate link is paused",
      preheader: "New clicks aren't being tracked for now.",
      eyebrow: "Affiliate program",
      heading: "Affiliate link paused",
      intro: "your affiliate link has been paused, so new clicks and sign-ups aren't being credited for now. Commissions you've already earned are safe. Reply to this email if you have questions.",
      reason: "You're receiving this because your Recktube affiliate account changed.",
    });
  return Promise.resolve(false);
}

export function sendCommissionUpdate(email: string, status: "pending" | "approved" | "paid" | "void", amount: number, currency: string) {
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  const copy = {
    pending: { subject: `💸 You earned a ${money} commission`, heading: "New commission", intro: `a creator you referred just paid, so you've earned a ${money} commission. It will be paid out once it's approved.` },
    approved: { subject: `Your ${money} commission is approved`, heading: "Commission approved", intro: `your ${money} commission has been approved and will be included in your next payout.` },
    paid: { subject: `✅ ${money} commission paid`, heading: "Commission paid", intro: `we've sent you ${money} in commission. Thank you for sharing Recktube!` },
    void: { subject: `A ${money} commission was cancelled`, heading: "Commission cancelled", intro: `a ${money} commission was cancelled, usually because the payment was refunded. Reply to this email if you have questions.` },
  }[status];
  return send(email, {
    ...copy,
    preheader: copy.intro.slice(0, 110),
    eyebrow: "Affiliate program",
    cta: { label: "See my earnings", url: `${app()}/invite` },
    reason: "You're receiving this because you're a Recktube affiliate.",
  });
}
