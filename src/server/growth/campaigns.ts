import { getDb } from "@/src/server/db";
import { getServerEnv } from "@/src/lib/env";
import { renderEmail, type EmailBlock } from "@/src/server/email-templates";
import { sendEmail } from "@/src/server/email";
import { GeminiTextProvider, isTextConfigured } from "@/src/server/ai/gemini";
import { PRODUCT_FACTS } from "@/src/server/support/facts";
import { openPixelUrl, trackedUrl, unsubscribeUrl } from "@/src/server/unsubscribe";
import { backendUnavailable, validationError } from "@/src/server/errors";
import { parseJsonObject } from "@/src/server/admin-ai";
import { MAILBOX_ADDRESS, MAILBOX_SENDER, type Mailbox } from "@/src/server/admin-mail";
import { founder, type Founder } from "@/src/server/founder";

/**
 * Email campaigns to Recktube's own users. Only people who opted in to
 * product email (verified, active accounts) are ever included — there is no
 * way to email addresses from outside the app. Every send has a one-click
 * unsubscribe, open/click tracking, and is paced to protect the domain.
 */

export type AudienceKey = "all_users" | "opted_in" | "active_30" | "inactive_14" | "no_video" | "low_credits" | "new_7";

export const AUDIENCES: { key: AudienceKey; label: string; hint: string }[] = [
  { key: "all_users", label: "All users (announcements)", hint: "Every verified user except people who unsubscribed or turned email off." },
  { key: "opted_in", label: "Everyone who opted in", hint: "All verified users who said yes to product email." },
  { key: "new_7", label: "New this week", hint: "Joined in the last 7 days." },
  { key: "active_30", label: "Active creators", hint: "Used Recktube in the last 30 days." },
  { key: "inactive_14", label: "Gone quiet", hint: "No activity for 14+ days." },
  { key: "no_video", label: "Haven't started a project", hint: "Signed up but never created a project." },
  { key: "low_credits", label: "Low on credits", hint: "Fewer than 50 credits left." },
];

export interface CampaignContent {
  preheader: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  videoUrl: string;
  videoThumb: string;
  videoTitle: string;
  /** Which of our addresses it comes from (default support@). */
  from?: Mailbox;
}

export const EMPTY_CONTENT: CampaignContent = { preheader: "", heading: "", body: "", ctaLabel: "Open Recktube", ctaUrl: "/dashboard", videoUrl: "", videoThumb: "", videoTitle: "" };

function db() {
  const d = getDb();
  if (!d) throw backendUnavailable("Database");
  return d;
}

const app = () => getServerEnv().APP_URL.replace(/\/$/, "");
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "campaign";

/** Base consent filter: opted in, verified, active, not deleted. Always applied. */
function audienceWhere(key: AudienceKey, d: ReturnType<typeof db>) {
  const base = d`u.marketing_opt_in = true AND u.email_verified_at IS NOT NULL AND u.status = 'active' AND u.deleted_at IS NULL`;
  if (key === "all_users") return d`u.email_verified_at IS NOT NULL AND u.status = 'active' AND u.deleted_at IS NULL AND u.email_unsubscribed_at IS NULL`;
  switch (key) {
    case "new_7":
      return d`${base} AND u.created_at > now() - interval '7 days'`;
    case "active_30":
      return d`${base} AND EXISTS (SELECT 1 FROM auth_sessions s WHERE s.user_id = u.id AND s.last_used_at > now() - interval '30 days')`;
    case "inactive_14":
      return d`${base} AND NOT EXISTS (SELECT 1 FROM auth_sessions s WHERE s.user_id = u.id AND s.last_used_at > now() - interval '14 days')`;
    case "no_video":
      return d`${base} AND NOT EXISTS (SELECT 1 FROM memberships m JOIN projects p ON p.workspace_id = m.workspace_id AND p.deleted_at IS NULL WHERE m.user_id = u.id)`;
    case "low_credits":
      return d`${base} AND EXISTS (SELECT 1 FROM memberships m JOIN credit_accounts c ON c.workspace_id = m.workspace_id WHERE m.user_id = u.id AND m.role = 'owner' AND c.unlimited = false AND c.balance < 50)`;
    default:
      return base;
  }
}

export function isAudience(key: string): key is AudienceKey {
  return AUDIENCES.some((a) => a.key === key);
}

export async function audienceCounts(): Promise<Record<AudienceKey, number>> {
  const d = db();
  const out = {} as Record<AudienceKey, number>;
  for (const a of AUDIENCES) {
    const [r] = await d`SELECT count(*) AS n FROM users u WHERE ${audienceWhere(a.key, d)}`;
    out[a.key] = Number(r?.n ?? 0);
  }
  return out;
}

/** Absolute, UTM-tagged link for Recktube paths; external https links pass through untouched. */
export function campaignLink(url: string, campaignSlug: string): string {
  const raw = url.trim() || "/dashboard";
  let u: URL;
  try {
    u = raw.startsWith("/") ? new URL(raw, app()) : new URL(raw);
  } catch {
    u = new URL("/dashboard", app());
  }
  if (u.protocol !== "https:" && !u.href.startsWith(app())) u = new URL("/dashboard", app());
  if (u.origin === new URL(app()).origin) {
    u.searchParams.set("utm_source", "email");
    u.searchParams.set("utm_medium", "campaign");
    u.searchParams.set("utm_campaign", campaignSlug);
  }
  return u.href;
}

/** Render one recipient's email. sendId null = preview/test (no tracking). */
export function renderCampaign(
  c: { name: string; subject: string; content: CampaignContent },
  recipient: { email: string; name: string },
  sendId: string | null,
  ceo?: Founder | null,
): { subject: string; html: string; text: string; listUnsubscribe: string | null } {
  const tag = slug(c.name);
  const link = (u: string) => {
    const target = campaignLink(u, tag);
    return sendId ? trackedUrl(sendId, target) : target;
  };
  const first = recipient.name.trim().split(/\s+/)[0] ?? "";
  const blocks: EmailBlock[] = [];
  if (c.content.videoUrl && c.content.videoThumb) {
    blocks.push({ type: "hero-video", title: c.content.videoTitle || "Watch the video", channel: "Recktube", thumbnail: c.content.videoThumb, url: link(c.content.videoUrl), meta: ["▶ Watch now"] });
  }
  for (const p of c.content.body.split(/\n{2,}/).map((t) => t.trim()).filter(Boolean)) blocks.push({ type: "text", text: p });
  blocks.push({ type: "text", text: ceo ? ceo.signoff : "The Recktube team" });
  const unsub = unsubscribeUrl(recipient.email, "marketing", sendId ?? undefined);
  const mail = renderEmail({
    preheader: c.content.preheader || c.content.body.slice(0, 120),
    eyebrow: ceo ? "A personal note from our founder" : "Recktube",
    heading: c.content.heading || c.subject,
    intro: ceo ? `Dear ${first || "creator"},` : first ? `Hi ${first},` : undefined,
    blocks,
    cta: c.content.ctaLabel ? { label: c.content.ctaLabel, url: link(c.content.ctaUrl || "/dashboard") } : undefined,
    reason: "You're receiving this because you chose to get product news and tips from Recktube.",
    appUrl: app(),
    unsubscribeUrl: unsub ?? undefined,
  });
  const html = sendId ? mail.html.replace("</body>", `<img src="${openPixelUrl(sendId)}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px"></body>`) : mail.html;
  return { subject: c.subject, html, text: mail.text, listUnsubscribe: unsub };
}

/** Draft a campaign from a one-line brief, grounded in real product facts. */
export async function writeCampaign(brief: string, audience: AudienceKey): Promise<{ subject: string } & CampaignContent> {
  if (!isTextConfigured()) throw backendUnavailable("AI writing");
  const who = AUDIENCES.find((a) => a.key === audience);
  const prompt = `You are Recktube's lifecycle marketer. Write ONE marketing email to existing Recktube users.

${PRODUCT_FACTS}

Audience: ${who?.label} — ${who?.hint}
Brief from the founder: ${brief.slice(0, 1200)}

Rules:
- Honest and specific: only mention real features and facts above. No fake discounts, deadlines, testimonials, numbers or scarcity.
- Subject ≤ 60 characters, no ALL CAPS, max one emoji, no spammy words ("FREE!!!", "act now", "guaranteed").
- Preheader ≤ 100 characters, complements the subject.
- Heading ≤ 8 words. Body: 2–4 short paragraphs separated by a blank line, warm and useful, ending with why to click.
- One clear call to action: a short button label and an app path such as /content-creator, /channel-creator, /studio/script, /intelligence/paying-niches, /intelligence/trends, /youtube, /dashboard.
- Don't include a greeting line or signature (the design adds them). Never mention AI vendors.

Respond ONLY with JSON: {"subject":"","preheader":"","heading":"","body":"","ctaLabel":"","ctaUrl":"/..."}`;
  const { text } = await new GeminiTextProvider().generateText({ prompt, maxTokens: 1200, json: true });
  const o = parseJsonObject(text);
  const str = (k: string, n: number) => (typeof o[k] === "string" ? String(o[k]).trim().slice(0, n) : "");
  const ctaUrl = str("ctaUrl", 200);
  return {
    ...EMPTY_CONTENT,
    subject: str("subject", 120),
    preheader: str("preheader", 160),
    heading: str("heading", 120),
    body: str("body", 4000),
    ctaLabel: str("ctaLabel", 40) || "Open Recktube",
    ctaUrl: /^\/[a-z0-9\-/?=&]*$/i.test(ctaUrl) ? ctaUrl : "/dashboard",
  };
}

type CampaignRow = { id: string; name: string; subject: string; audience: string; content: CampaignContent; status: string };

async function loadCampaign(id: string): Promise<CampaignRow> {
  const [c] = await db()`SELECT id, name, subject, audience, content, status FROM campaigns WHERE id = ${id}`;
  if (!c) throw validationError("Campaign not found.");
  return { id: String(c.id), name: String(c.name), subject: String(c.subject), audience: String(c.audience), content: { ...EMPTY_CONTENT, ...(c.content as object) }, status: String(c.status) };
}

export function assertReady(c: { subject: string; content: CampaignContent }): void {
  if (!c.subject.trim()) throw validationError("Add a subject line.");
  if (!c.content.heading.trim() && !c.content.body.trim()) throw validationError("Write the email first.");
}

/** Test send to one address (the admin), no tracking rows. */
export async function sendTest(id: string, to: string, name: string) {
  const c = await loadCampaign(id);
  assertReady(c);
  const ceo = c.content.from === "founder" ? await founder() : null;
  const mail = renderCampaign(c, { email: to, name }, null, ceo);
  const address = MAILBOX_ADDRESS[c.content.from && c.content.from in MAILBOX_ADDRESS ? c.content.from : "support"];
  return sendEmail({ to, subject: `[Test] ${mail.subject}`, html: mail.html, text: mail.text, kind: "marketing", fromName: ceo ? ceo.fromName : "Recktube", fromAddress: address, replyTo: address, listUnsubscribe: mail.listUnsubscribe ?? undefined });
}

/**
 * Send (or resume) a campaign. Recipients are frozen on first run; each run
 * sends queued rows at ~2/second until the time budget ends, re-checking
 * consent for every person. Call again to continue a large list.
 */
export async function runCampaign(id: string, budgetMs = 240_000): Promise<{ sent: number; failed: number; remaining: number }> {
  const d = db();
  const c = await loadCampaign(id);
  if (c.status === "sent") return { sent: 0, failed: 0, remaining: 0 };
  assertReady(c);
  if (!isAudience(c.audience)) throw validationError("Unknown audience.");
  if (c.status !== "sending") {
    await d`
      INSERT INTO campaign_sends (campaign_id, user_id, email)
      SELECT ${id}, u.id, u.email FROM users u WHERE ${audienceWhere(c.audience, d)}
      ON CONFLICT (campaign_id, user_id) DO NOTHING`;
    await d`UPDATE campaigns SET status = 'sending', updated_at = now() WHERE id = ${id}`;
  }
  const box: Mailbox = c.content.from && c.content.from in MAILBOX_ADDRESS ? c.content.from : "support";
  const ceo = box === "founder" ? await founder() : null;
  const sender = { name: ceo ? ceo.fromName : box === "support" ? "Recktube" : MAILBOX_SENDER[box].name, address: MAILBOX_ADDRESS[box] };
  const started = Date.now();
  let sent = 0;
  let failed = 0;
  while (Date.now() - started < budgetMs) {
    const batch = await d`
      SELECT s.id, s.email, s.user_id, u.name, u.marketing_opt_in, u.email_unsubscribed_at, u.status, u.deleted_at
      FROM campaign_sends s LEFT JOIN users u ON u.id = s.user_id
      WHERE s.campaign_id = ${id} AND s.status = 'queued' ORDER BY s.created_at LIMIT 25`;
    if (!batch.length) break;
    for (const r of batch) {
      if (Date.now() - started >= budgetMs) break;
      // Consent can change mid-campaign: re-check right before sending.
      if ((c.audience === "all_users" ? r.email_unsubscribed_at : !r.marketing_opt_in) || r.status !== "active" || r.deleted_at) {
        await d`UPDATE campaign_sends SET status = 'skipped' WHERE id = ${r.id}`;
        continue;
      }
      const mail = renderCampaign(c, { email: String(r.email), name: String(r.name ?? "") }, String(r.id), ceo);
      const res = await sendEmail({
        to: String(r.email),
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        kind: "marketing",
        fromName: sender.name,
        fromAddress: sender.address,
        replyTo: sender.address,
        listUnsubscribe: mail.listUnsubscribe ?? undefined,
      });
      if (res.sent) {
        sent++;
        await d`UPDATE campaign_sends SET status = 'sent', sent_at = now() WHERE id = ${r.id}`;
      } else {
        failed++;
        await d`UPDATE campaign_sends SET status = 'failed', error = ${res.reason.slice(0, 300)} WHERE id = ${r.id}`;
      }
      await new Promise((ok) => setTimeout(ok, 550)); // stay under the provider's rate limit
    }
  }
  const [left] = await d`SELECT count(*) AS n FROM campaign_sends WHERE campaign_id = ${id} AND status = 'queued'`;
  const remaining = Number(left?.n ?? 0);
  if (remaining === 0) await d`UPDATE campaigns SET status = 'sent', sent_at = coalesce(sent_at, now()), updated_at = now() WHERE id = ${id}`;
  return { sent, failed, remaining };
}

/** Daily cron: start due scheduled campaigns and finish any still sending. */
export async function runDueCampaigns() {
  const d = db();
  const due = await d`SELECT id FROM campaigns WHERE (status = 'scheduled' AND scheduled_at <= now()) OR status = 'sending' ORDER BY coalesce(scheduled_at, created_at) LIMIT 5`;
  const results: Record<string, unknown> = {};
  for (const c of due) results[String(c.id)] = await runCampaign(String(c.id), 50_000).catch((e) => ({ error: e instanceof Error ? e.message : "failed" }));
  return results;
}

export async function campaignStats(id: string) {
  const [s] = await db()`
    SELECT count(*) AS recipients,
      count(*) FILTER (WHERE status = 'sent') AS sent,
      count(*) FILTER (WHERE status = 'failed') AS failed,
      count(*) FILTER (WHERE status = 'skipped') AS skipped,
      count(*) FILTER (WHERE status = 'queued') AS queued,
      count(*) FILTER (WHERE opened_at IS NOT NULL) AS opened,
      count(*) FILTER (WHERE clicked_at IS NOT NULL) AS clicked,
      count(*) FILTER (WHERE unsubscribed_at IS NOT NULL) AS unsubscribed
    FROM campaign_sends WHERE campaign_id = ${id}`;
  const n = (k: string) => Number((s as Record<string, unknown>)?.[k] ?? 0);
  return { recipients: n("recipients"), sent: n("sent"), failed: n("failed"), skipped: n("skipped"), queued: n("queued"), opened: n("opened"), clicked: n("clicked"), unsubscribed: n("unsubscribed") };
}
