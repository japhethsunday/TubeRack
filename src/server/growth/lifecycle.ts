import { getDb } from "@/src/server/db";
import { getServerEnv } from "@/src/lib/env";
import { renderEmail } from "@/src/server/email-templates";
import { sendEmail } from "@/src/server/email";
import { unsubscribeUrl } from "@/src/server/unsubscribe";

/**
 * Automatic lifecycle emails (daily cron). Only for people who opted in to
 * product email; each kind goes to a person at most once (the comeback nudge
 * at most once a month), every email has one-click unsubscribe.
 */

const PER_RUN = 150;
const app = () => getServerEnv().APP_URL.replace(/\/$/, "");
const first = (n: string) => n.trim().split(/\s+/)[0] ?? "";
const utm = (path: string, c: string) => `${app()}${path}${path.includes("?") ? "&" : "?"}utm_source=email&utm_medium=lifecycle&utm_campaign=${c}`;

type Person = { id: string; email: string; name: string };

async function deliver(p: Person, kind: string, subject: string, layout: Omit<Parameters<typeof renderEmail>[0], "appUrl" | "reason" | "unsubscribeUrl">): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  // Claim first so parallel runs can't double-send.
  const claimed = await db`INSERT INTO lifecycle_sends (user_id, kind) VALUES (${p.id}, ${kind}) ON CONFLICT DO NOTHING RETURNING user_id`;
  if (!claimed.length) return false;
  const unsub = unsubscribeUrl(p.email, "marketing");
  const mail = renderEmail({ ...layout, appUrl: app(), reason: "You're receiving this because you chose to get tips and product news from Recktube.", unsubscribeUrl: unsub ?? undefined });
  const res = await sendEmail({ to: p.email, subject, ...mail, kind: "marketing", fromName: "Recktube", fromAddress: "support@recktube.xyz", replyTo: "support@recktube.xyz", listUnsubscribe: unsub ?? undefined });
  if (!res.sent) await db`DELETE FROM lifecycle_sends WHERE user_id = ${p.id} AND kind = ${kind}`; // retry tomorrow
  return res.sent;
}

const CONSENT = "u.marketing_opt_in = true AND u.email_verified_at IS NOT NULL AND u.status = 'active' AND u.deleted_at IS NULL";

export async function lifecycleEmails() {
  const db = getDb();
  if (!db) return { skipped: "no database" };
  const out = { gettingStarted: 0, comeback: 0, refill: 0 };

  // 1) Day 3+: signed up, never started a project.
  const starters = await db.unsafe(
    `SELECT u.id, u.email, u.name FROM users u
     WHERE ${CONSENT} AND u.created_at < now() - interval '3 days' AND u.created_at > now() - interval '21 days'
       AND NOT EXISTS (SELECT 1 FROM memberships m JOIN projects p ON p.workspace_id = m.workspace_id AND p.deleted_at IS NULL WHERE m.user_id = u.id)
       AND NOT EXISTS (SELECT 1 FROM lifecycle_sends l WHERE l.user_id = u.id AND l.kind = 'getting-started')
     LIMIT ${PER_RUN}`,
  );
  for (const r of starters) {
    const p = { id: String(r.id), email: String(r.email), name: String(r.name ?? "") };
    if (
      await deliver(p, "getting-started", "Your first video in about 5 minutes", {
        preheader: "Three steps from idea to a finished video — Recktube does the heavy lifting.",
        eyebrow: "Getting started",
        heading: "Let's make your first video",
        intro: `${first(p.name) ? `Hi ${first(p.name)}, y` : "Y"}ou've got a Recktube studio ready — here's the quickest way to your first video:`,
        blocks: [
          { type: "steps", items: [
            { title: "Pick a proven idea", text: "Content Creator shows what's working in your niche right now." },
            { title: "Write the script", text: "Script Studio drafts a retention-focused script you can edit." },
            { title: "Build the video", text: "Voice-over, visuals, music and captions come together in Video Studio." },
          ] },
          { type: "text", text: "You have free credits waiting — they refill every 30 days.\n\nThe Recktube team" },
        ],
        cta: { label: "Find my first idea", url: utm("/content-creator", "getting-started") },
      })
    ) out.gettingStarted++;
  }

  // 2) Comeback: has projects, quiet for 14+ days — at most once a month.
  const month = new Date().toISOString().slice(0, 7);
  const quiet = await db.unsafe(
    `SELECT u.id, u.email, u.name FROM users u
     WHERE ${CONSENT} AND u.created_at < now() - interval '14 days'
       AND EXISTS (SELECT 1 FROM memberships m JOIN projects p ON p.workspace_id = m.workspace_id AND p.deleted_at IS NULL WHERE m.user_id = u.id)
       AND NOT EXISTS (SELECT 1 FROM auth_sessions s WHERE s.user_id = u.id AND s.last_used_at > now() - interval '14 days')
       AND NOT EXISTS (SELECT 1 FROM lifecycle_sends l WHERE l.user_id = u.id AND l.kind LIKE 'comeback:%' AND l.sent_at > now() - interval '30 days')
     LIMIT ${PER_RUN}`,
  );
  for (const r of quiet) {
    const p = { id: String(r.id), email: String(r.email), name: String(r.name ?? "") };
    if (
      await deliver(p, `comeback:${month}`, "Your next video is waiting", {
        preheader: "Pick up where you left off — fresh trends in your niche are ready.",
        eyebrow: "Recktube",
        heading: "Ready for your next video?",
        intro: `${first(p.name) ? `Hi ${first(p.name)}, it's` : "It's"} been a little while. Your projects are saved exactly where you left them, and there are new trends in your niche worth a look.`,
        blocks: [{ type: "text", text: "Open Trend Radar to see what's taking off this week, then turn the best one into your next video.\n\nThe Recktube team" }],
        cta: { label: "See what's trending", url: utm("/intelligence/trends", "comeback") },
        secondary: { label: "Open my projects", url: utm("/projects", "comeback") },
      })
    ) out.comeback++;
  }

  // 3) Monthly credits refilled in the last day (workspace owners).
  const refills = await db.unsafe(
    `SELECT u.id, u.email, u.name, t.id AS tx, t.balance_after FROM credit_transactions t
     JOIN credit_accounts a ON a.id = t.account_id
     JOIN memberships m ON m.workspace_id = a.workspace_id AND m.role = 'owner'
     JOIN users u ON u.id = m.user_id
     WHERE t.kind = 'monthly' AND t.created_at > now() - interval '26 hours' AND a.unlimited = false AND ${CONSENT}
     LIMIT ${PER_RUN}`,
  );
  for (const r of refills) {
    const p = { id: String(r.id), email: String(r.email), name: String(r.name ?? "") };
    if (
      await deliver(p, `refill:${String(r.tx)}`, "Your Recktube credits are back", {
        preheader: `${Number(r.balance_after)} credits are ready to use.`,
        eyebrow: "Credits",
        heading: "Your credits are refilled",
        intro: `${first(p.name) ? `Hi ${first(p.name)}, y` : "Y"}our monthly credits have been topped back up — time to make something new.`,
        blocks: [
          { type: "stats", items: [{ label: "Balance", value: String(Number(r.balance_after)), tone: "good" }, { label: "Refills", value: "Every 30 days" }] },
          { type: "text", text: "Need an idea? Content Creator shows what's working in your niche right now.\n\nThe Recktube team" },
        ],
        cta: { label: "Find my next video", url: utm("/content-creator", "refill") },
      })
    ) out.refill++;
  }
  return out;
}
