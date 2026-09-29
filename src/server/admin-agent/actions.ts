import { z } from "zod";
import { adminDb, isAdmin } from "@/src/server/admin";
import { roleAllows, type AdminRole } from "@/src/lib/admin-roles";
import { revokeAllSessions, type SessionUser } from "@/src/server/auth";
import { audit } from "@/src/server/audit";
import { adjustCredits, setCreditPlan } from "@/src/server/credits";
import { notifyCreditGift } from "@/src/server/credit-emails";
import { FEATURES, featureFlags, putSetting } from "@/src/server/admin-ops";
import { normalizeCode } from "@/src/server/growth/codes";
import { AUDIENCES, EMPTY_CONTENT, audienceCounts, runCampaign, type AudienceKey } from "@/src/server/growth/campaigns";
import { updateAffiliate } from "@/src/server/growth/affiliates";
import { forbidden, notFound, validationError } from "@/src/server/errors";
import { sendAccountReactivated, sendAccountSuspended, sendPlanChanged, sendTeamMessage, workspaceOwnerEmails } from "@/src/server/admin-emails";

/**
 * Everything the admin assistant can change. The model only PROPOSES these;
 * each runs only after an admin taps Confirm, re-checks that admin's role,
 * validates its arguments again, and goes through the same emails and audit
 * log as the manual buttons. Deleting accounts, admin roles and payouts are
 * deliberately not here.
 */

const email = z.string().trim().toLowerCase().email().max(254);
const featureIds = FEATURES.map((f) => f.id) as [string, ...string[]];

export const ACTIONS = {
  give_credits: {
    permission: "credits.change",
    args: z.object({ email, amount: z.number().int().min(1).max(10_000), reason: z.string().trim().max(200).default("From the Recktube team") }),
    describe: (a: { email: string; amount: number; reason: string }) => `Give ${a.amount.toLocaleString("en-US")} credits to ${a.email} (“${a.reason}”) and email them.`,
  },
  remove_credits: {
    permission: "credits.change",
    args: z.object({ email, amount: z.number().int().min(1).max(1_000_000), reason: z.string().trim().max(200).default("Adjusted by the Recktube team") }),
    describe: (a: { email: string; amount: number; reason: string }) => `Remove ${a.amount.toLocaleString("en-US")} credits from ${a.email} (“${a.reason}”). The balance never goes below 0; no email is sent.`,
  },
  set_monthly_plan: {
    permission: "credits.change",
    args: z.object({ email, monthly: z.number().int().min(0).max(1_000_000) }),
    describe: (a: { email: string; monthly: number }) => `Set ${a.email}'s monthly allowance to ${a.monthly.toLocaleString("en-US")} credits and email them.`,
  },
  set_unlimited: {
    permission: "credits.change",
    args: z.object({ email, unlimited: z.boolean() }),
    describe: (a: { email: string; unlimited: boolean }) => (a.unlimited ? `Give ${a.email} unlimited credits and email them.` : `Turn off unlimited credits for ${a.email}.`),
  },
  suspend_user: {
    permission: "users.action",
    args: z.object({ email, reason: z.string().trim().min(3).max(300) }),
    describe: (a: { email: string; reason: string }) => `Suspend ${a.email}, sign them out everywhere and email them. Reason: “${a.reason}”.`,
  },
  reactivate_user: {
    permission: "users.action",
    args: z.object({ email }),
    describe: (a: { email: string }) => `Reactivate ${a.email} and email them.`,
  },
  send_email: {
    permission: "users.action",
    args: z.object({ email, subject: z.string().trim().min(3).max(140), message: z.string().trim().min(10).max(4000), from: z.enum(["support", "security", "founder", "owner"]).default("support") }),
    describe: (a: { email: string; subject: string; message: string; from: string }) => `Email ${a.email} from ${a.from}@recktube.xyz: “${a.subject}” — ${a.message.slice(0, 160)}${a.message.length > 160 ? "…" : ""}`,
  },
  email_everyone: {
    permission: "campaigns.send",
    args: z.object({
      subject: z.string().trim().min(3).max(140),
      message: z.string().trim().min(10).max(6000),
      from: z.enum(["support", "founder", "owner"]).default("founder"),
      audience: z.enum(AUDIENCES.map((a) => a.key) as [AudienceKey, ...AudienceKey[]]).default("opted_in"),
    }),
    describe: (a: { subject: string; message: string; from: string; audience: string }) =>
      `Email ${AUDIENCES.find((x) => x.key === a.audience)?.label.toLowerCase() ?? a.audience} from ${a.from}@recktube.xyz: “${a.subject}” — ${a.message.slice(0, 200)}${a.message.length > 200 ? "…" : ""} (branded design, unsubscribe link; people who opted out are skipped)`,
  },
  approve_affiliate: {
    permission: "affiliates.manage",
    args: z.object({ email }),
    describe: (a: { email: string }) => `Approve ${a.email} as an affiliate and email them their link.`,
  },
  create_bonus_code: {
    permission: "credits.change",
    args: z.object({ code: z.string().trim().min(3).max(32), credits: z.number().int().min(1).max(10_000), maxUses: z.number().int().min(1).max(100_000).nullable().default(null), days: z.number().int().min(1).max(365).nullable().default(null) }),
    describe: (a: { code: string; credits: number; maxUses: number | null; days: number | null }) =>
      `Create bonus code ${normalizeCode(a.code)} worth ${a.credits} credits${a.maxUses ? `, up to ${a.maxUses} uses` : ""}${a.days ? `, valid ${a.days} days` : ""}.`,
  },
  pause_tool: {
    permission: "features.edit",
    args: z.object({ feature: z.enum(featureIds), message: z.string().trim().max(200).default("") }),
    describe: (a: { feature: string; message: string }) => `Pause “${FEATURES.find((f) => f.id === a.feature)?.label ?? a.feature}” for everyone${a.message ? ` with the note “${a.message}”` : ""}.`,
  },
  resume_tool: {
    permission: "features.edit",
    args: z.object({ feature: z.enum(featureIds) }),
    describe: (a: { feature: string }) => `Switch “${FEATURES.find((f) => f.id === a.feature)?.label ?? a.feature}” back on.`,
  },
} as const;

export type ActionName = keyof typeof ACTIONS;
export const isActionName = (s: string): s is ActionName => Object.prototype.hasOwnProperty.call(ACTIONS, s);

/** Validate a proposal and write its human summary from the arguments (never from model text). */
export function prepare(name: string, raw: unknown): { name: ActionName; args: Record<string, unknown>; summary: string } | null {
  if (!isActionName(name)) return null;
  const spec = ACTIONS[name];
  const parsed = spec.args.safeParse(raw);
  if (!parsed.success) return null;
  return { name, args: parsed.data as Record<string, unknown>, summary: (spec.describe as (a: unknown) => string)(parsed.data) };
}

async function userByEmail(address: string) {
  const [u] = await adminDb()`SELECT id, email, name, status, email_verified_at FROM users WHERE lower(email) = ${address} AND deleted_at IS NULL LIMIT 1`;
  if (!u) throw notFound("User");
  return u;
}

async function ownedWorkspace(userId: string): Promise<string> {
  const [w] = await adminDb()`SELECT workspace_id FROM memberships WHERE user_id = ${userId} ORDER BY (role = 'owner') DESC, created_at ASC LIMIT 1`;
  if (!w) throw notFound("Workspace");
  return String(w.workspace_id);
}

/** Run a confirmed action as this admin. Returns a short result line. */
export async function runAction(admin: SessionUser, role: AdminRole, name: ActionName, rawArgs: unknown): Promise<string> {
  const spec = ACTIONS[name];
  if (!roleAllows(role, spec.permission)) throw forbidden("Your admin role doesn't allow this action.");
  const parsed = spec.args.safeParse(rawArgs);
  if (!parsed.success) throw validationError("That action's details are no longer valid.");
  // Each branch below reads only the fields its own schema just validated.
  const a = parsed.data as unknown as Record<string, never>;
  const log = (meta: Record<string, unknown>) => audit({ userId: admin.id, action: `admin.assistant.${name}`, metadata: meta });

  switch (name) {
    case "give_credits": {
      const u = await userByEmail(a.email);
      const ws = await ownedWorkspace(String(u.id));
      const state = await adjustCredits(ws, a.amount, a.reason);
      await notifyCreditGift(ws, { added: a.amount, balance: state?.unlimited ? undefined : state?.balance, note: a.reason });
      await log({ email: a.email, amount: a.amount });
      return `Added ${a.amount} credits to ${a.email}.`;
    }
    case "remove_credits": {
      const u = await userByEmail(a.email);
      const ws = await ownedWorkspace(String(u.id));
      const state = await adjustCredits(ws, -Number(a.amount), a.reason);
      await log({ email: a.email, amount: -Number(a.amount) });
      return state?.unlimited ? `Removed ${a.amount} credits from ${a.email} (note: they're on unlimited credits).` : `Removed credits from ${a.email}. New balance: ${state?.balance ?? 0}.`;
    }
    case "set_monthly_plan": {
      const u = await userByEmail(a.email);
      const ws = await ownedWorkspace(String(u.id));
      await setCreditPlan(ws, { monthlyGrant: a.monthly });
      for (const to of await workspaceOwnerEmails(ws)) await sendPlanChanged(to, a.monthly);
      await log({ email: a.email, monthly: a.monthly });
      return `${a.email} now gets ${a.monthly} credits a month.`;
    }
    case "set_unlimited": {
      const u = await userByEmail(a.email);
      const ws = await ownedWorkspace(String(u.id));
      await setCreditPlan(ws, { unlimited: a.unlimited });
      if (a.unlimited) await notifyCreditGift(ws, { unlimited: true });
      await log({ email: a.email, unlimited: a.unlimited });
      return a.unlimited ? `${a.email} now has unlimited credits.` : `Unlimited credits turned off for ${a.email}.`;
    }
    case "suspend_user": {
      const u = await userByEmail(a.email);
      if (String(u.id) === admin.id) throw forbidden("You can't suspend yourself.");
      if (isAdmin({ email: String(u.email), emailVerifiedAt: u.email_verified_at ? "y" : null, status: "active" })) throw forbidden("Admin accounts can't be suspended.");
      if (u.status === "suspended") return `${a.email} is already suspended.`;
      await adminDb()`UPDATE users SET status = 'suspended', updated_at = now() WHERE id = ${String(u.id)}`;
      await revokeAllSessions(String(u.id));
      await sendAccountSuspended(a.email);
      await log({ email: a.email, reason: a.reason });
      return `Suspended ${a.email}.`;
    }
    case "reactivate_user": {
      const u = await userByEmail(a.email);
      if (u.status !== "suspended") return `${a.email} isn't suspended.`;
      await adminDb()`UPDATE users SET status = 'active', updated_at = now() WHERE id = ${String(u.id)}`;
      await sendAccountReactivated(a.email);
      await log({ email: a.email });
      return `Reactivated ${a.email}.`;
    }
    case "send_email": {
      await userByEmail(a.email);
      const ok = await sendTeamMessage(a.email, a.subject, a.message, a.from);
      await log({ email: a.email, subject: a.subject, from: a.from });
      return ok ? `Emailed ${a.email}.` : `Couldn't send the email to ${a.email} (email service unavailable).`;
    }
    case "email_everyone": {
      const audience = a.audience as AudienceKey;
      const reach = (await audienceCounts())[audience] ?? 0;
      if (!reach) return "Nobody in that group can receive email right now.";
      const content = { ...EMPTY_CONTENT, preheader: String(a.message).slice(0, 110), heading: a.subject, body: a.message, from: a.from };
      const [c] = await adminDb()`
        INSERT INTO campaigns (name, subject, audience, content, created_by)
        VALUES (${`Assistant: ${String(a.subject).slice(0, 60)}`}, ${a.subject}, ${audience}, ${JSON.stringify(content)}, ${admin.id}) RETURNING id`;
      // Send what fits now; the daily job finishes anything left.
      const r = await runCampaign(String(c.id), 40_000);
      await log({ campaign: String(c.id), audience, from: a.from, reach });
      return `Sending to ${reach} people: ${r.sent} sent now${r.failed ? `, ${r.failed} failed` : ""}${r.remaining ? `, ${r.remaining} more going out shortly` : ""}. Track it under Campaigns.`;
    }
    case "approve_affiliate": {
      const u = await userByEmail(a.email);
      const [aff] = await adminDb()`SELECT id FROM affiliates WHERE user_id = ${String(u.id)}`;
      if (!aff) throw notFound("Affiliate application");
      await updateAffiliate(String(aff.id), { status: "approved" });
      await log({ email: a.email });
      return `Approved ${a.email} as an affiliate.`;
    }
    case "create_bonus_code": {
      const code = normalizeCode(a.code);
      if (code.length < 3) throw validationError("Use 3–32 letters, numbers, - or _.");
      const expires = a.days ? new Date(Date.now() + Number(a.days) * 86_400_000) : null;
      const rows = await adminDb()`
        INSERT INTO promo_codes (code, credits, note, expires_at, max_uses, created_by)
        VALUES (${code}, ${a.credits}, ${"Created with the admin assistant"}, ${expires}, ${a.maxUses}, ${admin.id}) ON CONFLICT DO NOTHING RETURNING code`;
      if (!rows.length) throw validationError("That code already exists.");
      await log({ code, credits: a.credits });
      return `Created code ${code}.`;
    }
    case "pause_tool":
    case "resume_tool": {
      const flags = { ...(await featureFlags()) };
      flags[a.feature] = { off: name === "pause_tool", message: name === "pause_tool" ? String(a.message ?? "") : "" };
      await putSetting("features", flags, admin.id);
      await log({ feature: a.feature });
      return name === "pause_tool" ? `Paused ${a.feature}.` : `Switched ${a.feature} back on.`;
    }
  }
}
