import { cleanStorage } from "@/src/server/storage-cleaner";
import { lifecycleEmails } from "@/src/server/growth/lifecycle";
import { runDueCampaigns } from "@/src/server/growth/campaigns";
import { getDb } from "@/src/server/db";
import { pruneSharedLimits } from "@/src/server/shared-limit";
import { getServerEnv } from "@/src/lib/env";
import { sendEmail } from "@/src/server/email";
import { renderEmail, num, type EmailBlock } from "@/src/server/email-templates";
import { rotateDueTests } from "@/src/server/growth/abtests";
import { runWatch, type TrendWatch } from "@/src/server/growth/trends";
import { competitorReport } from "@/src/server/growth/competitors";
import { notifyWorkspace, workspaceEmails } from "@/src/server/growth/notify";
import type { TrendResult, TrendVideo } from "@/src/lib/growth/trends";
import { breakoutAlert, isBreakout, nicheBrief } from "@/src/server/growth/briefs";

/** Daily automation (Vercel Cron): A/B rotation, trend digests, competitor alerts, reminders. */

const MAX_TREND_SCANS = 45; // ~4,600 YouTube units
const MAX_AUTO_WATCHES = 3; // niches followed automatically per workspace
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

function db() {
  const d = getDb();
  if (!d) throw new Error("Database unavailable.");
  return d;
}

function appUrl(): string {
  return getServerEnv().APP_URL.replace(/\/$/, "");
}

async function trendDigests(): Promise<{ scanned: number; emailed: number; failed: number; alerts: number }> {
  const watches = (await db()`
    SELECT w.id, w.user_id, w.workspace_id, w.query, w.region, w.email_digest, w.last_run_at, w.last_results, u.email
    FROM trend_watches w JOIN users u ON u.id = w.user_id
    ORDER BY w.last_run_at NULLS FIRST LIMIT ${MAX_TREND_SCANS}
  `) as unknown as (TrendWatch & { workspace_id: string; email: string })[];
  const byUser = new Map<string, { email: string; sections: { query: string; result: TrendResult }[] }>();
  const alerted = new Set<string>();
  let alerts = 0;
  let scanned = 0;
  let failed = 0;
  for (const w of watches) {
    try {
      const result = await runWatch(w);
      scanned++;
      const fresh = result.videos.filter((v) => v.isNew).slice(0, 3);
      if (fresh.length) {
        await notifyWorkspace(w.workspace_id, {
          type: "trend.rising",
          title: `Rising in “${w.query}”`,
          body: fresh.map((v) => `${v.title} (${compact.format(v.viewsPerHour)} views/hr)`).join(" · "),
          metadata: { watchId: w.id },
        });
      }
      // Instant alert when a new upload in the niche is racing ahead (one per person per run).
      const breakout = result.videos.find((v) => isBreakout(v, result.medianViewsPerHour));
      if (breakout && w.email_digest && !alerted.has(w.user_id)) {
        alerted.add(w.user_id);
        await sendBreakout(w.email, w.query, breakout, result.medianViewsPerHour);
        alerts++;
      }
      if (w.email_digest) {
        const entry = byUser.get(w.user_id) ?? { email: w.email, sections: [] };
        entry.sections.push({ query: w.query, result });
        byUser.set(w.user_id, entry);
      }
    } catch (error) {
      failed++;
      console.error("trend scan failed:", w.query, error instanceof Error ? error.message : String(error));
    }
  }
  let emailed = 0;
  for (const { email, sections } of byUser.values()) {
    const mail = nicheBriefing(sections);
    if (!mail) continue;
    const res = await sendEmail({ to: email, subject: mail.subject, text: mail.text, html: mail.html, kind: "digest" });
    if (res.sent) emailed++;
  }
  return { scanned, emailed, failed, alerts };
}

async function sendBreakout(to: string, niche: string, video: TrendVideo, median: number) {
  const mail = breakoutAlert(niche, video, median, appUrl());
  await sendEmail({ to, subject: mail.subject, text: mail.text, html: mail.html, kind: "alert" });
}

/**
 * Everyone gets briefs about their own niche without setting anything up:
 * niches from their channels, saved niches and Content Creator sets are
 * followed automatically (a few per workspace; removable in Trend Radar).
 */
async function autoFollowNiches(): Promise<{ added: number }> {
  const rows = (await db()`
    WITH niches AS (
      SELECT c.workspace_id, m.user_id, c.niche AS query, c.updated_at AS at
        FROM channels c JOIN memberships m ON m.workspace_id = c.workspace_id AND m.role = 'owner'
        WHERE c.deleted_at IS NULL AND length(trim(c.niche)) > 2
      UNION ALL
      SELECT workspace_id, user_id, query, created_at FROM saved_niches
      UNION ALL
      SELECT workspace_id, user_id, niche, created_at FROM content_idea_sets WHERE user_id IS NOT NULL AND length(trim(niche)) > 2
    )
    SELECT DISTINCT ON (workspace_id, lower(trim(query))) workspace_id, user_id, trim(query) AS query
    FROM niches ORDER BY workspace_id, lower(trim(query)), at DESC
  `) as unknown as { workspace_id: string; user_id: string; query: string }[];
  const perWorkspace = new Map<string, number>();
  const existing = (await db()`SELECT workspace_id, count(*)::int AS n FROM trend_watches GROUP BY workspace_id`) as unknown as { workspace_id: string; n: number }[];
  for (const e of existing) perWorkspace.set(e.workspace_id, e.n);
  let added = 0;
  for (const r of rows) {
    const n = perWorkspace.get(r.workspace_id) ?? 0;
    if (n >= MAX_AUTO_WATCHES) continue;
    const res = await db()`
      INSERT INTO trend_watches (workspace_id, user_id, query, region, email_digest)
      VALUES (${r.workspace_id}, ${r.user_id}, ${r.query.slice(0, 120)}, '', true)
      ON CONFLICT (workspace_id, query, region) DO NOTHING RETURNING id
    `;
    if (res.length) {
      added++;
      perWorkspace.set(r.workspace_id, n + 1);
    }
  }
  return { added };
}

async function competitorAlerts(): Promise<{ workspaces: number; emailed: number }> {
  const rows = await db()`SELECT DISTINCT workspace_id FROM competitors`;
  let emailed = 0;
  for (const r of rows) {
    const workspaceId = String(r.workspace_id);
    const reports = await competitorReport(workspaceId).catch((e) => {
      console.error("competitor refresh failed:", e instanceof Error ? e.message : String(e));
      return [];
    });
    const breakouts = reports.flatMap((rep) =>
      rep.uploads
        .filter((u) => rep.newOutliers.includes(u.id))
        .map((u) => ({ channel: rep.competitor.title, id: u.id, title: u.title, thumbnail: u.thumbnail, views: u.views, multiple: u.multiple, median: rep.stats.medianViews })),
    );
    if (breakouts.length === 0) continue;
    breakouts.sort((a, b) => b.multiple - a.multiple);
    const top = breakouts.slice(0, 5);
    const lead = top[0];
    const blocks: EmailBlock[] = [
      {
        type: "hero-video",
        title: lead.title,
        channel: lead.channel,
        thumbnail: lead.thumbnail,
        url: `https://www.youtube.com/watch?v=${lead.id}`,
        meta: [`${num(lead.views)} views`, `${lead.multiple.toFixed(1)}× their median`],
        badge: "Breakout",
      },
    ];
    if (top.length > 1) {
      blocks.push({ type: "heading", text: "More breakouts" });
      blocks.push({
        type: "videos",
        items: top.slice(1).map((b) => ({ title: b.title, channel: b.channel, thumbnail: b.thumbnail, url: `https://www.youtube.com/watch?v=${b.id}`, meta: `${num(b.views)} views · ${b.multiple.toFixed(1)}× median`, badge: "Breakout" })),
      });
    }
    blocks.push({
      type: "callout",
      title: "Your move",
      text: "A video that beats its channel's median this hard shows proven demand. Make your own take — a new angle, a fresher hook, a better thumbnail — while the topic is hot.",
      action: { label: "Test the idea in Idea Lab", url: `${appUrl()}/intelligence/lab?seed=${encodeURIComponent(lead.title)}` },
    });
    const mail = renderEmail({
      preheader: `${lead.channel} just hit ${lead.multiple.toFixed(1)}× their usual views with “${lead.title}”.`,
      eyebrow: "Competitor alert",
      heading: top.length === 1 ? `${lead.channel} has a breakout video` : `${top.length} breakout videos from channels you track`,
      intro: "These uploads are pulling far more views than the channel normally gets — a strong signal of what your audience wants right now.",
      blocks,
      cta: { label: "Open competitor tracker", url: `${appUrl()}/intelligence/competitors` },
      reason: "You get this because you track these channels in Recktube.",
      appUrl: appUrl(),
    });
    for (const to of await workspaceEmails(workspaceId)) {
      const res = await sendEmail({ to, subject: `Breakout: “${lead.title.slice(0, 60)}” (${lead.multiple.toFixed(1)}× median)`, text: mail.text, html: mail.html, kind: "alert" });
      if (res.sent) emailed++;
    }
  }
  return { workspaces: rows.length, emailed };
}

/** "Top videos in your niche" briefing, in today's rotating format. */
export function nicheBriefing(sections: { query: string; result: TrendResult }[]) {
  return nicheBrief(sections, appUrl());
}

/** Privacy promise: cached YouTube API data is refreshed or deleted within 30 days. */
async function purgeStaleYouTubeData(): Promise<{ marketCache: number; trendResults: number }> {
  const cache = await db()`DELETE FROM niche_market_cache WHERE scanned_at < now() - interval '30 days' RETURNING key`;
  const trends = await db()`
    UPDATE trend_watches SET last_results = '{}'::jsonb
    WHERE last_results <> '{}'::jsonb AND (last_run_at IS NULL OR last_run_at < now() - interval '30 days') RETURNING id`;
  return { marketCache: cache.length, trendResults: trends.length };
}

async function calendarReminders(): Promise<{ sent: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const items = await db()`
    SELECT c.id, c.title, c.kind, to_char(c.date, 'YYYY-MM-DD') AS date, c.time, c.workspace_id, u.email, u.id AS user_id
    FROM calendar_items c JOIN users u ON u.id = c.user_id
    WHERE c.remind AND c.reminded_at IS NULL AND c.status = 'planned' AND c.date BETWEEN ${today} AND ${tomorrow}
    ORDER BY c.date LIMIT 500
  `;
  const byUser = new Map<string, { email: string; lines: string[]; ids: string[]; workspaceId: string; agenda: { day: string; date: string; title: string; detail?: string }[] }>();
  for (const it of items) {
    const e = byUser.get(String(it.user_id)) ?? { email: String(it.email), lines: [], ids: [], workspaceId: String(it.workspace_id), agenda: [] };
    const d = new Date(`${String(it.date)}T00:00:00Z`);
    e.agenda.push({
      day: it.date === today ? "Today" : "Tmrw",
      date: d.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" }),
      title: String(it.title),
      detail: `${String(it.kind)}${it.time ? ` · ${String(it.time)}` : ""}`,
    });
    e.lines.push(`• ${it.date === today ? "Today" : "Tomorrow"}${it.time ? ` ${it.time}` : ""} — [${String(it.kind)}] ${String(it.title)}`);
    e.ids.push(String(it.id));
    byUser.set(String(it.user_id), e);
  }
  let sent = 0;
  for (const e of byUser.values()) {
    const mail = renderEmail({
      preheader: e.agenda.map((a) => a.title).join(" · ").slice(0, 140),
      eyebrow: "Content calendar",
      heading: e.agenda.length === 1 ? "You have something due soon" : `${e.agenda.length} things due soon`,
      intro: "Here's what's coming up. Consistency is what the algorithm rewards — keep the streak going.",
      blocks: [{ type: "agenda", items: e.agenda }],
      cta: { label: "Open calendar", url: `${appUrl()}/calendar` },
      reason: "Reminders come from calendar items with “Remind me” on. Change it on each item.",
      appUrl: appUrl(),
    });
    const res = await sendEmail({ to: e.email, subject: `Content calendar: ${e.lines.length} item${e.lines.length === 1 ? "" : "s"} due soon`, text: mail.text, html: mail.html, kind: "reminder" });
    await notifyWorkspace(e.workspaceId, { type: "calendar.reminder", title: "Due soon on your calendar", body: e.lines.join("\n") });
    if (res.sent) sent++;
    await db()`UPDATE calendar_items SET reminded_at = now() WHERE id = ANY(${e.ids})`;
  }
  return { sent };
}

export async function runDaily() {
  const safe = async <T>(name: string, fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (error) {
      console.error(`daily ${name} failed:`, error instanceof Error ? error.message : String(error));
      return { error: error instanceof Error ? error.message.slice(0, 200) : "failed" };
    }
  };
  return {
    abtests: await safe("abtests", rotateDueTests),
    reminders: await safe("reminders", calendarReminders),
    competitors: await safe("competitors", competitorAlerts),
    follow: await safe("follow", autoFollowNiches),
    trends: await safe("trends", trendDigests),
    housekeeping: await safe("housekeeping", pruneSharedLimits),
    storage: await safe("storage", () => cleanStorage({ dryRun: false })),
    retention: await safe("retention", purgeStaleYouTubeData),
    lifecycle: await safe("lifecycle", lifecycleEmails),
    campaigns: await safe("campaigns", runDueCampaigns),
  };
}
