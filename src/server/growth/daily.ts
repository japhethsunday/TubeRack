import { getDb } from "@/src/server/db";
import { getServerEnv } from "@/src/lib/env";
import { sendEmail, actionEmail } from "@/src/server/email";
import { rotateDueTests } from "@/src/server/growth/abtests";
import { runWatch, type TrendWatch } from "@/src/server/growth/trends";
import { competitorReport } from "@/src/server/growth/competitors";
import { notifyWorkspace } from "@/src/server/growth/notify";
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
    const body = sections
      .map((s) => {
        const top = s.result.videos.slice(0, 5).map((v) => `• ${v.title} — ${v.channelTitle} · ${compact.format(v.views)} views · ${compact.format(v.viewsPerHour)}/hr${v.isNew ? " · NEW" : ""}`);
        const phrases = s.result.phrases.slice(0, 6).map((p) => p.phrase).join(", ");
        return `${s.query.toUpperCase()}\n${top.join("\n")}${phrases ? `\nRising phrases: ${phrases}` : ""}`;
      })
      .join("\n\n");
    const mail = actionEmail({
      heading: "Your daily trend radar",
      body: `What's moving on YouTube in the last 7 days:\n\n${body}`,
      action: "Open Trend Radar",
      url: `${appUrl()}/intelligence/trends`,
      footer: "You get this because a topic in your Trend Radar has the daily email on. Turn it off there anytime.",
    });
    const res = await sendEmail({ to: email, subject: "Trend radar: what's rising today", text: mail.text, html: mail.html, kind: "digest" });
    if (res.sent) emailed++;
  }
  return { scanned, emailed, failed };
}

async function competitorAlerts(): Promise<{ workspaces: number }> {
  const rows = await db()`SELECT DISTINCT workspace_id FROM competitors`;
  for (const r of rows) {
    await competitorReport(String(r.workspace_id)).catch((e) => console.error("competitor refresh failed:", e instanceof Error ? e.message : String(e)));
  }
  return { workspaces: rows.length };
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
  const byUser = new Map<string, { email: string; lines: string[]; ids: string[]; workspaceId: string }>();
  for (const it of items) {
    const e = byUser.get(String(it.user_id)) ?? { email: String(it.email), lines: [], ids: [], workspaceId: String(it.workspace_id) };
    e.lines.push(`• ${it.date === today ? "Today" : "Tomorrow"}${it.time ? ` ${it.time}` : ""} — [${String(it.kind)}] ${String(it.title)}`);
    e.ids.push(String(it.id));
    byUser.set(String(it.user_id), e);
  }
  let sent = 0;
  for (const e of byUser.values()) {
    const mail = actionEmail({
      heading: "Coming up on your content calendar",
      body: e.lines.join("\n"),
      action: "Open calendar",
      url: `${appUrl()}/calendar`,
      footer: "Reminders come from items with “Remind me” on. Change it on each item.",
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
  };
}
