import { getDb } from "@/src/server/db";
import { pruneSharedLimits } from "@/src/server/shared-limit";
import { getServerEnv } from "@/src/lib/env";
import { sendEmail } from "@/src/server/email";
import { renderEmail, num, type EmailBlock } from "@/src/server/email-templates";
import { rotateDueTests } from "@/src/server/growth/abtests";
import { runWatch, type TrendWatch } from "@/src/server/growth/trends";
import { competitorReport } from "@/src/server/growth/competitors";
import { notifyWorkspace, workspaceEmails } from "@/src/server/growth/notify";
import type { TrendResult } from "@/src/lib/growth/trends";

/** Daily automation (Vercel Cron): A/B rotation, trend digests, competitor alerts, reminders. */

const MAX_TREND_SCANS = 25; // ~2,550 YouTube units
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

function db() {
  const d = getDb();
  if (!d) throw new Error("Database unavailable.");
  return d;
}

function appUrl(): string {
  return getServerEnv().APP_URL.replace(/\/$/, "");
}

async function trendDigests(): Promise<{ scanned: number; emailed: number; failed: number }> {
  const watches = (await db()`
    SELECT w.id, w.user_id, w.workspace_id, w.query, w.region, w.email_digest, w.last_run_at, w.last_results, u.email
    FROM trend_watches w JOIN users u ON u.id = w.user_id
    ORDER BY w.last_run_at NULLS FIRST LIMIT ${MAX_TREND_SCANS}
  `) as unknown as (TrendWatch & { workspace_id: string; email: string })[];
  const byUser = new Map<string, { email: string; sections: { query: string; result: TrendResult }[] }>();
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
  return { scanned, emailed, failed };
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
      reason: "You get this because you track these channels in TubeRack.",
      appUrl: appUrl(),
    });
    for (const to of await workspaceEmails(workspaceId)) {
      const res = await sendEmail({ to, subject: `Breakout: “${lead.title.slice(0, 60)}” (${lead.multiple.toFixed(1)}× median)`, text: mail.text, html: mail.html, kind: "alert" });
      if (res.sent) emailed++;
    }
  }
  return { workspaces: rows.length, emailed };
}

/** "Top videos in your niche" briefing from the day's trend scans. */
export function nicheBriefing(sections: { query: string; result: TrendResult }[]): { subject: string; html: string; text: string } | null {
  const withVideos = sections.filter((s) => s.result.videos.length > 0);
  if (withVideos.length === 0) return null;
  const all = withVideos.flatMap((s) => s.result.videos.map((v) => ({ ...v, query: s.query, median: s.result.medianViewsPerHour })));
  const best = [...all].sort((a, b) => b.viewsPerHour - a.viewsPerHour)[0];
  const watch = (id: string) => `https://www.youtube.com/watch?v=${id}`;
  const lift = (v: { viewsPerHour: number; median: number }) => (v.median > 0 ? v.viewsPerHour / v.median : 0);
  const newCount = all.filter((v) => v.isNew).length;
  const blocks: EmailBlock[] = [
    {
      type: "stats",
      items: [
        { label: "Videos tracked", value: String(all.length) },
        { label: "New since yesterday", value: String(newCount), tone: newCount ? "good" : undefined },
        { label: "Fastest views / hour", value: num(best.viewsPerHour), tone: "hot" },
      ],
    },
    {
      type: "hero-video",
      rank: 1,
      title: best.title,
      channel: `${best.channelTitle}${best.channelSubs !== null ? ` · ${num(best.channelSubs)} subscribers` : ""}`,
      thumbnail: best.thumbnail,
      url: watch(best.videoId),
      meta: [`${num(best.views)} views`, `${num(best.viewsPerHour)} views/hour`, ...(lift(best) >= 1.5 ? [`${lift(best).toFixed(1)}× the niche pace`] : [])],
      badge: best.isNew ? "New today" : lift(best) >= 2 ? "Breakout" : undefined,
    },
  ];
  for (const s of withVideos) {
    const rest = s.result.videos.filter((v) => v.videoId !== best.videoId).slice(0, 4);
    if (rest.length) {
      blocks.push({ type: "heading", text: `Top in “${s.query}”`, note: "last 7 days" });
      blocks.push({
        type: "videos",
        items: rest.map((v, i) => ({
          rank: i + (s.result.videos[0]?.videoId === best.videoId ? 2 : 1),
          title: v.title,
          channel: v.channelTitle,
          thumbnail: v.thumbnail,
          url: watch(v.videoId),
          meta: `${num(v.views)} views · ${num(v.viewsPerHour)}/hr`,
          badge: v.isNew ? "New" : s.result.medianViewsPerHour > 0 && v.viewsPerHour >= 2 * s.result.medianViewsPerHour ? "Breakout" : undefined,
        })),
      });
    }
    const phrases = s.result.phrases.slice(0, 8).map((p) => p.phrase);
    if (phrases.length) blocks.push({ type: "chips", label: `Phrases rising in “${s.query}” titles:`, items: phrases });
  }
  const topPhrase = withVideos[0].result.phrases[0]?.phrase;
  blocks.push({
    type: "callout",
    title: "Today's idea",
    text: topPhrase
      ? `Viewers are clicking on “${topPhrase}” right now. Take the #1 video's promise, add your own angle, and ship it while the topic is rising.`
      : "Take the #1 video's promise, add your own angle, and ship it while the topic is rising.",
    action: { label: "Turn it into a video", url: `${appUrl()}/intelligence/lab?seed=${encodeURIComponent(topPhrase || best.title)}` },
  });
  const niches = withVideos.map((s) => s.query);
  const mail = renderEmail({
    preheader: `#1 right now: “${best.title}” — ${num(best.viewsPerHour)} views/hour.`,
    eyebrow: "Daily niche briefing",
    heading: niches.length === 1 ? `Best videos in ${niches[0]} today` : "Best videos in your niches today",
    intro: `What's winning on YouTube in the last 7 days${niches.length > 1 ? ` across ${niches.join(", ")}` : ""} — ranked by how fast they're pulling views.`,
    blocks,
    cta: { label: "Open Trend Radar", url: `${appUrl()}/intelligence/trends` },
    secondary: { label: "Find more niches", url: `${appUrl()}/intelligence/niche` },
    reason: "You get this because a topic in your Trend Radar has the daily email on. Turn it off there anytime.",
    appUrl: appUrl(),
  });
  return { subject: `🔥 #1 in ${niches[0]}: “${best.title.slice(0, 50)}${best.title.length > 50 ? "…" : ""}”`, ...mail };
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
    trends: await safe("trends", trendDigests),
    housekeeping: await safe("housekeeping", pruneSharedLimits),
  };
}
