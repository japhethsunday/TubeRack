import { z } from "zod";
import { adminDb, adminEmails, adminOverview, adminUserDetail, adminUsers } from "@/src/server/admin";
import { roleAllows, type AdminRole } from "@/src/lib/admin-roles";
import { FEATURES, featureFlags } from "@/src/server/admin-ops";
import { getInboxEmail, listInbox } from "@/src/server/inbox";

/**
 * Read-only look-ups for the admin assistant. Each one is gated by the same
 * permission as the matching admin page, returns small plain data (no
 * secrets, no password hashes, no tokens), and can't change anything.
 */

const n = (v: unknown) => Number(v ?? 0);
const q = z.string().trim().max(200);

export const TOOLS = {
  business_overview: {
    permission: "overview",
    about: "Totals: users, sign-ups (1/7/30 days), active users, generations and failures by kind (7 days), projects, storage, open support chats, pending affiliates.",
    args: z.object({}),
    run: async () => {
      const o = await adminOverview();
      const [x] = await adminDb()`
        SELECT (SELECT count(*) FROM support_conversations WHERE status = 'handoff') AS support_waiting,
               (SELECT count(*) FROM affiliates WHERE status = 'pending') AS affiliates_pending,
               (SELECT count(*) FROM safety_flags WHERE status = 'open') AS safety_open`;
      return { users: o.users, active: o.active, usage7d: o.usage, projects: o.content.projects, storageMB: Math.round(o.content.storageBytes / 1e6), youtubeConnected: o.content.youtubeConnections, supportWaitingForTeam: n(x?.support_waiting), affiliatesPending: n(x?.affiliates_pending), safetyFlagsOpen: n(x?.safety_open), last14Days: o.daily };
    },
  },
  find_users: {
    permission: "users.list",
    about: "Search accounts by email or name (empty query = newest). Returns up to 10 with status, credits, activity.",
    args: z.object({ query: q.default("") }),
    run: async (a: { query: string }) => {
      const r = await adminUsers(a.query, 1);
      return { total: r.total, users: r.users.slice(0, 10).map((u) => ({ email: u.email, name: u.name, status: u.status, verified: u.verified, joined: u.createdAt.slice(0, 10), lastSeen: u.lastSeen?.slice(0, 10) ?? null, credits: u.unlimited ? "unlimited" : u.credits, projects: u.projects, generations30d: u.usage30, youtube: u.youtube })) };
    },
  },
  user_details: {
    permission: "users.view",
    about: "Everything about one account by email: status, credits and plan, projects, recent generations (and failures), credit history, referrals, affiliate status, support chats.",
    args: z.object({ email: z.string().trim().toLowerCase().max(254) }),
    run: async (a: { email: string }) => {
      const [u] = await adminDb()`SELECT id FROM users WHERE lower(email) = ${a.email} AND deleted_at IS NULL LIMIT 1`;
      if (!u) return { found: false };
      const d = await adminUserDetail(String(u.id));
      if (!d) return { found: false };
      const [extra] = await adminDb()`
        SELECT (SELECT count(*) FROM referrals WHERE referrer_id = ${String(u.id)}) AS invited,
               (SELECT status FROM affiliates WHERE user_id = ${String(u.id)}) AS affiliate,
               (SELECT count(*) FROM support_conversations WHERE user_id = ${String(u.id)}) AS support_chats,
               (SELECT string_agg(subject, ' | ') FROM (SELECT subject FROM support_conversations WHERE user_id = ${String(u.id)} ORDER BY updated_at DESC LIMIT 3) s) AS recent_support`;
      return {
        found: true,
        account: { email: d.user.email, name: d.user.name, status: d.user.status, verified: d.user.verified, joined: d.user.createdAt.slice(0, 10), isAdmin: d.user.admin },
        workspaces: d.workspaces.map((w) => ({ role: w.role, credits: w.unlimited ? "unlimited" : w.balance, monthlyAllowance: w.monthlyGrant, projects: w.projects, youtube: w.youtube })),
        recentGenerations: d.usage.slice(0, 12).map((x) => `${x.createdAt.slice(0, 16)} ${x.kind} ${x.status}${x.provider ? ` (${x.provider})` : ""}`),
        creditHistory: d.ledger.slice(0, 8).map((x) => `${x.createdAt.slice(0, 10)} ${x.amount > 0 ? "+" : ""}${x.amount} ${x.kind}${x.ref ? ` — ${x.ref.slice(0, 60)}` : ""}`),
        projects: d.projects.slice(0, 8).map((p) => p.name),
        activeSessions: d.sessions.length,
        friendsInvited: n(extra?.invited),
        affiliate: extra?.affiliate ?? "none",
        supportChats: n(extra?.support_chats),
        recentSupportTopics: extra?.recent_support ?? "",
      };
    },
  },
  recent_failures: {
    permission: "usage.view",
    about: "Failed generations in the last N hours (1–168), grouped by tool and provider, with the users most affected.",
    args: z.object({ hours: z.number().int().min(1).max(168).default(24) }),
    run: async (a: { hours: number }) => {
      const since = new Date(Date.now() - a.hours * 3600_000);
      const groups = await adminDb()`
        SELECT kind, coalesce(provider, '') AS provider, count(*) FILTER (WHERE status = 'failed') AS failed, count(*) AS total
        FROM usage_events WHERE created_at > ${since} GROUP BY kind, provider HAVING count(*) FILTER (WHERE status = 'failed') > 0 ORDER BY 3 DESC LIMIT 15`;
      const who = await adminDb()`
        SELECT u.email, count(*) AS failed FROM usage_events e JOIN users u ON u.id = e.user_id
        WHERE e.created_at > ${since} AND e.status = 'failed' GROUP BY u.email ORDER BY 2 DESC LIMIT 5`;
      return { hours: a.hours, byTool: groups.map((g) => ({ tool: String(g.kind), provider: String(g.provider), failed: n(g.failed), ofTotal: n(g.total) })), mostAffected: who.map((w) => ({ email: String(w.email), failed: n(w.failed) })) };
    },
  },
  support_queue: {
    permission: "support.list",
    about: "Support chats waiting for a teammate, newest first: id, the creator's email, subject, the hand-over summary and their latest messages (to draft replies with reply_support).",
    args: z.object({}),
    run: async () => {
      const rows = await adminDb()`
        SELECT c.id, c.subject, c.category, c.handoff_summary, c.updated_at, u.email,
          (SELECT json_agg(x.body ORDER BY x.created_at) FROM (SELECT body, created_at FROM support_messages m WHERE m.conversation_id = c.id AND m.role = 'user' ORDER BY created_at DESC LIMIT 3) x) AS latest
        FROM support_conversations c JOIN users u ON u.id = c.user_id
        WHERE c.status = 'handoff' ORDER BY c.updated_at DESC LIMIT 10`;
      return {
        waiting: rows.map((r) => ({
          id: String(r.id),
          email: String(r.email),
          subject: String(r.subject),
          category: String(r.category),
          summary: String(r.handoff_summary ?? "").slice(0, 400),
          latestMessages: (Array.isArray(r.latest) ? r.latest : []).map((b: unknown) => String(b).slice(0, 500)),
          updated: new Date(String(r.updated_at)).toISOString().slice(0, 16),
        })),
      };
    },
  },
  inbox: {
    permission: "inbox.read",
    about: "Recent email received at support@, security@, founder@ or owner@ (mailbox: all|support|security|founder|owner). Pass id to read one email's text.",
    args: z.object({ mailbox: z.enum(["all", "support", "security", "founder", "owner"]).default("all"), id: z.string().trim().max(100).optional() }),
    run: async (a: { mailbox: string; id?: string }) => {
      if (a.id) {
        const e = await getInboxEmail(a.id);
        const body = (e.text || (e.html ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
        return { id: e.id, to: `${e.mailbox}@recktube.xyz`, from: e.fromName ? `${e.fromName} <${e.from}>` : e.from, subject: e.subject, received: e.receivedAt.slice(0, 16), automated: e.automated, text: body.slice(0, 3000) };
      }
      const { emails } = await listInbox();
      return { emails: emails.filter((e) => a.mailbox === "all" || e.mailbox === a.mailbox).slice(0, 20).map((e) => ({ id: e.id, to: `${e.mailbox}@recktube.xyz`, from: e.fromName ? `${e.fromName} <${e.from}>` : e.from, subject: e.subject.slice(0, 160), received: e.receivedAt.slice(0, 16) })) };
    },
  },
  promo_videos: {
    permission: "promo.list",
    about: "Recent promo videos: title, status (ready, producing, posted, failed), YouTube link when posted, and any error.",
    args: z.object({}),
    run: async () => {
      const rows = await adminDb()`SELECT package->>'title' AS title, status, youtube_video_id, last_error, created_at FROM promo_videos ORDER BY created_at DESC LIMIT 12`;
      return { videos: rows.map((r) => ({ title: String(r.title ?? ""), status: String(r.status), youtube: r.youtube_video_id ? `https://youtu.be/${String(r.youtube_video_id)}` : null, error: String(r.last_error ?? "") || null, made: new Date(String(r.created_at)).toISOString().slice(0, 16) })) };
    },
  },
  youtube_channel: {
    permission: "overview",
    about: "Our own Recktube YouTube channel: subscribers, total views, video count, the last N days (views, watch time, subscribers gained/lost, likes, top videos, traffic sources, impressions and click rate when available) and the latest uploads with views and privacy.",
    args: z.object({ days: z.number().int().min(7).max(90).default(28) }),
    run: async (a: { days: number }) => {
      const ws = await ownerWorkspace();
      if (!ws) return { error: "No owner workspace found." };
      const { channelAnalytics, myVideos } = await import("@/src/server/google/channel");
      try {
        const [an, vids] = await Promise.all([channelAnalytics(ws, a.days), myVideos(ws, 12).catch(() => [])]);
        return {
          channel: an.channel.title,
          subscribers: an.channel.subscribers,
          totalViews: an.channel.views,
          videos: an.channel.videos,
          period: `${an.range.start} to ${an.range.end}`,
          totals: an.totals,
          impressions: an.impressions,
          topVideos: an.topVideos.slice(0, 5).map((v) => ({ title: v.title, views: v.views, avgViewPercent: v.averageViewPercentage, subscribersGained: v.subscribersGained })),
          traffic: an.traffic.slice(0, 5),
          latestUploads: vids.map((v) => ({ title: v.title, views: v.views, privacy: v.privacy, published: v.publishedAt.slice(0, 10), link: `https://youtu.be/${v.id}` })),
          note: "Analytics lag about 2 days, so brand-new videos may show few or no views yet.",
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { error: /not connected/i.test(msg) || error?.constructor?.name === "NotConnectedError" ? "The YouTube channel isn't connected. Connect it on the YouTube page." : `YouTube didn't answer: ${msg.slice(0, 160)}` };
      }
    },
  },
  scheduled_emails: {
    permission: "campaigns.list",
    about: "Email campaigns scheduled or sending: subject, audience, when, status.",
    args: z.object({}),
    run: async () => {
      const rows = await adminDb()`SELECT subject, audience, status, scheduled_at FROM campaigns WHERE status IN ('scheduled', 'sending') ORDER BY scheduled_at NULLS FIRST LIMIT 20`;
      return { campaigns: rows.map((r) => ({ subject: String(r.subject), audience: String(r.audience), status: String(r.status), when: r.scheduled_at ? new Date(String(r.scheduled_at)).toISOString().slice(0, 16) : null })) };
    },
  },
  growth_report: {
    permission: "growth.view",
    about: "Where sign-ups came from in the last N days (1–90): sources/campaigns, referrals, affiliates.",
    args: z.object({ days: z.number().int().min(1).max(90).default(30) }),
    run: async (a: { days: number }) => {
      const since = new Date(Date.now() - a.days * 86_400_000);
      const sources = await adminDb()`
        SELECT coalesce(nullif(signup_source, ''), 'direct') AS source, count(*) AS n FROM users
        WHERE created_at > ${since} AND deleted_at IS NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 12`;
      const [r] = await adminDb()`
        SELECT (SELECT count(*) FROM referrals WHERE created_at > ${since}) AS referred,
               (SELECT count(*) FROM users WHERE affiliate_id IS NOT NULL AND created_at > ${since}) AS via_affiliates`;
      return { days: a.days, sources: sources.map((s) => ({ source: String(s.source), signups: n(s.n) })), referredByFriends: n(r?.referred), viaAffiliates: n(r?.via_affiliates) };
    },
  },
  affiliates_overview: {
    permission: "affiliates.view",
    about: "Affiliate partners: pending applications, top partners by sign-ups, commission owed.",
    args: z.object({}),
    run: async () => {
      const rows = await adminDb()`
        SELECT a.code, a.status, a.clicks, u.email, (SELECT count(*) FROM users x WHERE x.affiliate_id = a.id) AS signups,
               (SELECT coalesce(sum(commission_minor), 0) FROM affiliate_commissions c WHERE c.affiliate_id = a.id AND c.status IN ('pending', 'approved')) AS owed
        FROM affiliates a JOIN users u ON u.id = a.user_id ORDER BY (a.status = 'pending') DESC, 5 DESC LIMIT 15`;
      return { partners: rows.map((r) => ({ email: String(r.email), link: `/go/${String(r.code)}`, status: String(r.status), clicks: n(r.clicks), signups: n(r.signups), owed: n(r.owed) / 100 })) };
    },
  },
  safety_flags: {
    permission: "users.view",
    about: "Open safety flags (suspected fake accounts, referral/affiliate fraud, harmful prompts) with evidence.",
    args: z.object({}),
    run: async () => {
      const rows = await adminDb()`
        SELECT f.kind, f.severity, f.evidence, f.created_at, u.email FROM safety_flags f LEFT JOIN users u ON u.id = f.user_id
        WHERE f.status = 'open' ORDER BY f.created_at DESC LIMIT 15`;
      return { open: rows.map((r) => ({ email: r.email ? String(r.email) : null, kind: String(r.kind), severity: String(r.severity), evidence: String(r.evidence).slice(0, 300), when: new Date(String(r.created_at)).toISOString().slice(0, 16) })) };
    },
  },
  tool_switches: {
    permission: "features.view",
    about: "Which AI tools are switched on or paused right now.",
    args: z.object({}),
    run: async () => {
      const flags = await featureFlags();
      return { tools: FEATURES.map((f) => ({ id: f.id, name: f.label, paused: Boolean(flags[f.id]?.off), note: flags[f.id]?.message ?? "" })) };
    },
  },
} as const;

export type ToolName = keyof typeof TOOLS;

/** The founder's own workspace, where the Recktube channel is connected. */
async function ownerWorkspace(): Promise<string | null> {
  const owner = adminEmails()[0];
  if (!owner) return null;
  const [w] = await adminDb()`
    SELECT m.workspace_id FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE lower(u.email) = ${owner} ORDER BY (m.role = 'owner') DESC, m.created_at ASC LIMIT 1`;
  return w ? String(w.workspace_id) : null;
}

export function toolList(role: AdminRole): string {
  return Object.entries(TOOLS)
    .filter(([, t]) => roleAllows(role, t.permission))
    .map(([name, t]) => `- ${name}: ${t.about}`)
    .join("\n");
}

export async function runTool(role: AdminRole, name: string, raw: unknown): Promise<unknown> {
  if (!Object.prototype.hasOwnProperty.call(TOOLS, name)) return { error: "Unknown look-up." };
  const tool = TOOLS[name as ToolName];
  if (!roleAllows(role, tool.permission)) return { error: "Your admin role can't see this." };
  const parsed = tool.args.safeParse(raw ?? {});
  if (!parsed.success) return { error: "Invalid details for this look-up." };
  try {
    return await (tool.run as (a: unknown) => Promise<unknown>)(parsed.data);
  } catch (error) {
    console.error("assistant tool failed:", name, error instanceof Error ? error.message : String(error));
    return { error: "That look-up failed." };
  }
}
