import { z } from "zod";
import { adminDb, isAdmin } from "@/src/server/admin";
import { roleAllows, type AdminRole } from "@/src/lib/admin-roles";
import { revokeAllSessions, type SessionUser } from "@/src/server/auth";
import { audit } from "@/src/server/audit";
import { adjustCredits, setCreditPlan } from "@/src/server/credits";
import { notifyCreditGift } from "@/src/server/credit-emails";
import { FEATURES, featureFlags, putSetting } from "@/src/server/admin-ops";
import { createAdminCode, deleteAdminCode, normalizeCode } from "@/src/server/growth/codes";
import { PROMO_FEATURES, createPromoProject, styleFor, writePromo } from "@/src/server/growth/promo";
import { cancelScheduledPost, cancelScheduledPosts } from "@/src/server/tiktok/schedule";
import { runPromoAutopilot } from "@/src/server/growth/promo-autopilot";
import { sendTeamReply } from "@/src/server/support/emails";
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
      audience: z.enum(AUDIENCES.map((a) => a.key) as [AudienceKey, ...AudienceKey[]]).default("all_users"),
    }),
    describe: (a: { subject: string; message: string; from: string; audience: string }) =>
      `Email ${AUDIENCES.find((x) => x.key === a.audience)?.label.toLowerCase() ?? a.audience} from ${a.from}@recktube.xyz: “${a.subject}” — ${a.message.slice(0, 200)}${a.message.length > 200 ? "…" : ""} (branded design, unsubscribe link; people who unsubscribed are skipped)`,
  },
  schedule_email_series: {
    permission: "campaigns.send",
    args: z.object({
      emails: z.array(z.object({ subject: z.string().trim().min(3).max(140), message: z.string().trim().min(10).max(2500) })).min(1).max(7),
      from: z.enum(["support", "founder", "owner"]).default("founder"),
      audience: z.enum(AUDIENCES.map((x) => x.key) as [AudienceKey, ...AudienceKey[]]).default("all_users"),
      startInDays: z.number().int().min(0).max(14).default(1),
      everyDays: z.number().int().min(1).max(7).default(1),
    }),
    describe: (a: { emails: { subject: string }[]; from: string; audience: string; startInDays: number; everyDays: number }) => {
      const dates = a.emails.map((_, i) => seriesDate(a.startInDays + i * a.everyDays));
      const fmt = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
      return `Schedule ${a.emails.length} email${a.emails.length === 1 ? "" : "s"} from ${a.from}@recktube.xyz to ${AUDIENCES.find((x) => x.key === a.audience)?.label.toLowerCase() ?? a.audience}, ${a.everyDays === 1 ? "one a day" : `every ${a.everyDays} days`}, ${fmt(dates[0])} → ${fmt(dates[dates.length - 1])} (sent ~7:00 UTC):\n${a.emails.map((e, i) => `${i + 1}. ${fmt(dates[i])} — “${e.subject}”`).join("\n")}`;
    },
  },
  set_promo_autopilot: {
    permission: "promo.write",
    args: z.object({ enabled: z.boolean(), perDay: z.number().int().min(1).max(5).default(1) }),
    describe: (a: { enabled: boolean; perDay: number }) =>
      a.enabled ? `Turn on Promo autopilot: ${a.perDay} new video${a.perDay === 1 ? "" : "s"} written every morning, emailed to you to make and post.` : "Turn off Promo autopilot.",
  },
  cancel_scheduled_emails: {
    permission: "campaigns.send",
    args: z.object({}),
    describe: () => "Cancel every email campaign that is scheduled but not sent yet.",
  },
  reply_support: {
    permission: "support.act",
    args: z.object({
      conversationId: z.string().uuid(),
      message: z.string().trim().min(10).max(4000),
      resolve: z.boolean().default(false),
    }),
    describe: (a: { conversationId: string; message: string; resolve: boolean }) =>
      `Reply in support chat ${a.conversationId.slice(0, 8)}${a.resolve ? " and mark it solved" : ""} (in the app and by email): “${a.message.slice(0, 220)}${a.message.length > 220 ? "…" : ""}”`,
  },
  write_promo_videos: {
    permission: "promo.write",
    args: z.object({
      count: z.number().int().min(1).max(5).default(2),
      feature: z.enum(PROMO_FEATURES.map((f) => f.id) as [string, ...string[]]).optional(),
      angle: z.string().trim().max(300).default(""),
    }),
    describe: (a: { count: number; feature?: string; angle: string }) =>
      `Write ${a.count} new promo video${a.count === 1 ? "" : "s"} for Recktube${a.feature ? ` about ${PROMO_FEATURES.find((f) => f.id === a.feature)?.name ?? a.feature}` : " (different features and styles)"}${a.angle ? `, angle: “${a.angle}”` : ""}. They appear on the Promo page, ready to produce.`,
  },
  make_and_post_videos: {
    permission: "promo.write",
    args: z.object({
      count: z.number().int().min(1).max(7).default(2),
      feature: z.enum(PROMO_FEATURES.map((f) => f.id) as [string, ...string[]]).optional(),
      angle: z.string().trim().max(300).default(""),
      platforms: z.array(z.enum(["youtube", "tiktok"])).min(1).max(2).default(["youtube"]),
      when: z.enum(["now", "morning", "afternoon", "evening"]).default("now"),
      startInDays: z.number().int().min(0).max(14).default(0),
    }),
    describe: (a: { count: number; feature?: string; angle: string; platforms: string[]; when: string; startInDays: number }) => {
      const where = a.platforms.map((p) => (p === "tiktok" ? "TikTok" : "YouTube")).join(" and ");
      const hour = { morning: "9 AM", afternoon: "2 PM", evening: "7 PM" }[a.when as "morning"] ?? "";
      const start = a.startInDays === 0 ? "today (or tomorrow if that time has passed)" : a.startInDays === 1 ? "tomorrow" : `in ${a.startInDays} days`;
      const plan =
        a.when === "now"
          ? a.count > 1 ? `the first goes live ${a.startInDays ? start : "now"}, the others one per day at 5 PM` : a.startInDays ? `goes live ${start} at 5 PM` : "goes live now"
          : `one per day at ${hour}, starting ${start}`;
      return `Make ${a.count} promo video${a.count === 1 ? "" : "s"}${a.feature ? ` about ${PROMO_FEATURES.find((f) => f.id === a.feature)?.name ?? a.feature}` : ""} and schedule ${a.count === 1 ? "it" : "them"} on ${where}, hands-free: ${plan}, your local time. A studio tab does the work: keep it open about 3–5 minutes per video.`;
    },
  },
  cancel_scheduled_post: {
    permission: "promo.write",
    args: z.object({ id: z.string().trim().min(8).max(80), title: z.string().trim().max(120).default("") }),
    describe: (a: { id: string; title: string }) => `Cancel the scheduled TikTok post${a.title ? ` “${a.title}”` : ""}. It won't be posted.`,
  },
  cancel_scheduled_posts: {
    permission: "promo.write",
    args: z.object({}),
    describe: () => "Cancel every TikTok post that is scheduled but not posted yet. (YouTube videos already scheduled stay scheduled on YouTube; change them in YouTube Studio.)",
  },
  delete_promo_videos: {
    permission: "promo.delete",
    args: z.object({ which: z.enum(["failed", "unposted", "all"]).default("failed") }),
    describe: (a: { which: string }) =>
      `Delete ${a.which === "failed" ? "the failed" : a.which === "unposted" ? "all not-yet-posted" : "ALL"} promo videos from the Promo list. Videos already on YouTube stay on YouTube; their studio projects stay too.`,
  },
  approve_affiliate: {
    permission: "affiliates.manage",
    args: z.object({ email }),
    describe: (a: { email: string }) => `Approve ${a.email} as an affiliate and email them their link.`,
  },
  create_bonus_code: {
    permission: "credits.change",
    args: z.object({
      kind: z.enum(["group", "individual"]),
      credits: z.number().int().min(1).max(10_000),
      /** Empty: a random code. */
      code: z.string().trim().max(32).default(""),
      /** Individual codes: the one account that can use it. */
      email: z.string().trim().max(254).default(""),
      /** Group codes: how many people can use it (null = unlimited). */
      maxUses: z.number().int().min(1).max(100_000).nullable().default(null),
      days: z.number().int().min(1).max(365).nullable().default(null),
      note: z.string().trim().max(200).default(""),
    }),
    describe: (a: { kind: string; credits: number; code: string; email: string; maxUses: number | null; days: number | null }) =>
      `Create ${a.kind === "individual" ? `an individual code for ${a.email || "(no email)"} only` : `a group code for ${a.maxUses ? `up to ${a.maxUses} people` : "unlimited people"}`}${a.code ? `: ${normalizeCode(a.code)}` : " (random code)"}, worth ${a.credits} credits each${a.days ? `, valid ${a.days} days` : ", never expires"}. Each person can use it once.`,
  },
  delete_bonus_code: {
    permission: "credits.change",
    args: z.object({ code: z.string().trim().min(3).max(32) }),
    describe: (a: { code: string }) => `Delete bonus code ${normalizeCode(a.code)}. It stops working immediately; people who already redeemed it keep their credits.`,
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

/** Scheduled campaigns go out with the daily job at 07:00 UTC: day N at that time. */
export function seriesDate(days: number, now = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 7, 0, 0));
  d.setUTCDate(d.getUTCDate() + days);
  return days === 0 ? now : d;
}
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
export async function runAction(admin: SessionUser, role: AdminRole, name: ActionName, rawArgs: unknown): Promise<string | { text: string; launch: string }> {
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
    case "schedule_email_series": {
      const emails = a.emails as unknown as { subject: string; message: string }[];
      const series = `Series ${new Date().toISOString().slice(0, 10)}`;
      let first: string | null = null;
      for (const [i, e] of emails.entries()) {
        const when = seriesDate(Number(a.startInDays) + i * Number(a.everyDays));
        const content = { ...EMPTY_CONTENT, preheader: e.message.slice(0, 110), heading: e.subject, body: e.message, from: a.from };
        const [c] = await adminDb()`
          INSERT INTO campaigns (name, subject, audience, content, created_by, status, scheduled_at)
          VALUES (${`${series} · ${i + 1}/${emails.length}: ${e.subject.slice(0, 50)}`}, ${e.subject}, ${a.audience}, ${JSON.stringify(content)}, ${admin.id}, 'scheduled', ${when}) RETURNING id`;
        if (i === 0) first = String(c.id);
      }
      // Starting today: send the first one straight away.
      if (Number(a.startInDays) === 0 && first) await runCampaign(first, 40_000);
      await log({ count: emails.length, audience: a.audience, from: a.from, startInDays: a.startInDays, everyDays: a.everyDays });
      return `Scheduled ${emails.length} email${emails.length === 1 ? "" : "s"}${Number(a.startInDays) === 0 ? " (the first is going out now)" : ""}. See them under Campaigns; say "cancel scheduled emails" to stop them.`;
    }
    case "set_promo_autopilot": {
      await putSetting("promo_autopilot", { enabled: Boolean(a.enabled), perDay: Number(a.perDay) }, admin.id);
      await log({ enabled: a.enabled, perDay: a.perDay });
      return a.enabled ? `Autopilot is on: ${a.perDay} a day, starting tomorrow morning.` : "Autopilot is off.";
    }
    case "cancel_scheduled_emails": {
      const rows = await adminDb()`UPDATE campaigns SET status = 'draft', scheduled_at = null, updated_at = now() WHERE status = 'scheduled' RETURNING id`;
      await log({ cancelled: rows.length });
      return rows.length ? `Cancelled ${rows.length} scheduled email${rows.length === 1 ? "" : "s"} (kept as drafts under Campaigns).` : "Nothing was scheduled.";
    }
    case "reply_support": {
      const db = adminDb();
      const [c] = await db`SELECT c.id, c.subject, u.email, u.name, u.email_verified_at FROM support_conversations c JOIN users u ON u.id = c.user_id WHERE c.id = ${a.conversationId}`;
      if (!c) throw notFound("Support chat");
      await db`INSERT INTO support_messages (conversation_id, role, body, meta) VALUES (${a.conversationId}, 'admin', ${a.message}, ${JSON.stringify({ by: admin.email, via: "assistant" })})`;
      await db`UPDATE support_conversations SET user_unread = true, admin_unread = false, status = ${a.resolve ? "resolved" : "handoff"}, updated_at = now() WHERE id = ${a.conversationId}`;
      const emailed = c.email_verified_at ? (await sendTeamReply(String(c.email), String(c.name), String(c.subject) || "your support request", a.message)).sent : false;
      await log({ conversation: a.conversationId, emailed, resolved: a.resolve });
      return `Replied to ${String(c.email)}${emailed ? " (in the app and by email)" : " (in the app)"}${a.resolve ? ", marked solved" : ""}.`;
    }
    case "write_promo_videos": {
      const count = Number(a.count);
      let made = 0;
      if (a.feature || a.angle) {
        for (let i = 0; i < count; i++) {
          const feature = String(a.feature || PROMO_FEATURES[i % PROMO_FEATURES.length].id);
          const style = styleFor(i);
          const pkg = await writePromo({ feature, style, platform: "YouTube Shorts", lengthSec: 30, angle: String(a.angle ?? "") });
          if (!pkg.scenes.length) continue;
          await adminDb()`INSERT INTO promo_videos (created_by, feature, style, platform, length_sec, package, source, status) VALUES (${admin.id}, ${feature}, ${style}, ${"YouTube Shorts"}, ${30}, ${JSON.stringify(pkg)}, 'manual', 'ready')`;
          made++;
        }
      } else {
        made = (await runPromoAutopilot({ force: true, count, createdBy: admin.id })).made;
      }
      await log({ count, made });
      return made ? `Wrote ${made} promo video${made === 1 ? "" : "s"}. Open Promo videos and tap Produce video.` : "Couldn't write the promo videos just now. Try again in a minute.";
    }
    case "make_and_post_videos": {
      const count = Number(a.count);
      const ids: string[] = [];
      const seed = Math.floor(Date.now() / 1000);
      for (let i = 0; i < count; i++) {
        const feature = String(a.feature || PROMO_FEATURES[(seed + i * 3) % PROMO_FEATURES.length].id);
        const style = styleFor(i, seed * 1000);
        try {
          const pkg = await writePromo({ feature, style, platform: "YouTube Shorts", lengthSec: 30, angle: String(a.angle ?? "") });
          if (!pkg.scenes.length) continue;
          const projectId = await createPromoProject(admin, { feature, platform: "YouTube Shorts", pkg });
          const [r] = await adminDb()`
            INSERT INTO promo_videos (created_by, feature, style, platform, length_sec, package, source, status, project_id)
            VALUES (${admin.id}, ${feature}, ${style}, ${"YouTube Shorts"}, ${30}, ${JSON.stringify(pkg)}, 'manual', 'producing', ${projectId}) RETURNING id`;
          ids.push(String(r.id));
        } catch (error) {
          console.error("make_and_post write failed:", error instanceof Error ? error.message : String(error));
        }
      }
      await log({ count, made: ids.length });
      if (!ids.length) return "Couldn't write the videos just now. Try again in a minute.";
      const pf = (a.platforms as unknown as string[]).map((p) => (p === "tiktok" ? "tt" : "yt")).join(",");
      const q = new URLSearchParams({ ids: ids.join(","), at: String(a.when), start: String(a.startInDays), pf });
      return { text: `${ids.length} video${ids.length === 1 ? "" : "s"} written. Opening the studio to make and schedule ${ids.length === 1 ? "it" : "them"} now. Keep that tab open.`, launch: `/admin/promo/run?${q}` };
    }
    case "cancel_scheduled_post": {
      const ok = await cancelScheduledPost(String(a.id));
      await log({ id: a.id, cancelled: ok });
      return ok ? "Cancelled that TikTok post." : "That post isn't waiting any more (it was already posted, failed or cancelled).";
    }
    case "cancel_scheduled_posts": {
      const n = await cancelScheduledPosts();
      await log({ cancelled: n });
      return n ? `Cancelled ${n} scheduled TikTok post${n === 1 ? "" : "s"}.` : "No TikTok posts were waiting.";
    }
    case "delete_promo_videos": {
      const rows =
        a.which === "failed"
          ? await adminDb()`DELETE FROM promo_videos WHERE status = 'failed' RETURNING id`
          : a.which === "unposted"
            ? await adminDb()`DELETE FROM promo_videos WHERE youtube_video_id IS NULL RETURNING id`
            : await adminDb()`DELETE FROM promo_videos RETURNING id`;
      await log({ which: a.which, deleted: rows.length });
      return rows.length ? `Deleted ${rows.length} promo video${rows.length === 1 ? "" : "s"}.` : "There were none to delete.";
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
      const out = await createAdminCode({ kind: a.kind, credits: a.credits, code: a.code, email: a.email, maxUses: a.maxUses, days: a.days, note: a.note || "Created with the admin assistant", createdBy: admin.id });
      await log({ code: out.code, credits: a.credits, kind: a.kind });
      return `Created ${out.code}${out.forEmail ? ` for ${out.forEmail}` : ""}. Share it as https://www.recktube.xyz/redeem?code=${out.code}`;
    }
    case "delete_bonus_code": {
      const out = await deleteAdminCode(a.code);
      await log(out);
      return `Deleted ${out.code}${out.uses ? ` (it had been redeemed ${out.uses} time${out.uses === 1 ? "" : "s"}; those credits stay)` : ""}.`;
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
