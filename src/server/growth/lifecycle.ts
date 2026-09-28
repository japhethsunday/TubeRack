import { getDb } from "@/src/server/db";
import { getServerEnv } from "@/src/lib/env";
import { renderEmail } from "@/src/server/email-templates";
import { sendEmail } from "@/src/server/email";
import { unsubscribeUrl } from "@/src/server/unsubscribe";
import { personalCode } from "@/src/server/growth/codes";

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

async function deliver(p: Person, kind: string, subject: string, layout: Omit<Parameters<typeof renderEmail>[0], "appUrl" | "reason" | "unsubscribeUrl">, fromName = "Recktube"): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  // Claim first so parallel runs can't double-send.
  const claimed = await db`INSERT INTO lifecycle_sends (user_id, kind) VALUES (${p.id}, ${kind}) ON CONFLICT DO NOTHING RETURNING user_id`;
  if (!claimed.length) return false;
  const unsub = unsubscribeUrl(p.email, "marketing");
  const mail = renderEmail({ ...layout, appUrl: app(), reason: "You're receiving this because you chose to get tips and product news from Recktube.", unsubscribeUrl: unsub ?? undefined });
  const res = await sendEmail({ to: p.email, subject, ...mail, kind: "marketing", fromName, fromAddress: "support@recktube.xyz", replyTo: "support@recktube.xyz", listUnsubscribe: unsub ?? undefined });
  if (!res.sent) await db`DELETE FROM lifecycle_sends WHERE user_id = ${p.id} AND kind = ${kind}`; // retry tomorrow
  return res.sent;
}

const CONSENT = "u.marketing_opt_in = true AND u.email_verified_at IS NOT NULL AND u.status = 'active' AND u.deleted_at IS NULL";

/* ---------------- Welcome series (founder letter + a guide over 7 days) ---------------- */

const FOUNDER = { name: "Japheth Sunday", role: "Founder, Recktube" };
const GUIDE = { name: "Ada", role: "Creator Success, Recktube" };
const greet = (p: Person) => (first(p.name) ? `Hi ${first(p.name)},` : "Hi there,");

interface WelcomeStep {
  kind: string;
  day: number;
  /** Sender name shown in the inbox. */
  from: string;
  /** Extra SQL condition (users u) — e.g. skip people who already made a video. */
  where?: string;
  subject: (p: Person) => string;
  layout: (p: Person) => Omit<Parameters<typeof renderEmail>[0], "appUrl" | "reason" | "unsubscribeUrl">;
}

const MADE_VIDEO = `EXISTS (SELECT 1 FROM usage_events e WHERE e.user_id = u.id AND e.kind = 'autovideo' AND e.status = 'completed')`;

export const WELCOME_STEPS: WelcomeStep[] = [
  {
    kind: "welcome:0",
    from: "Japheth from Recktube",
    day: 0,
    subject: () => "A personal welcome to Recktube",
    layout: (p) => ({
      preheader: "Thank you for joining — here's why we built Recktube, and your 100 free credits.",
      eyebrow: "Welcome",
      heading: "Welcome to Recktube",
      intro: `${greet(p)}\n\nI'm Japheth, the founder of Recktube. Thank you for signing up — I'm genuinely glad you're here.`,
      blocks: [
        { type: "text", text: "I started Recktube with a simple goal: help every creator go from an idea to a finished YouTube video without an editing team, expensive tools or weeks of work. Research, script, voice-over, visuals, music and captions — in one studio." },
        { type: "stats", items: [{ label: "Your free credits", value: "100", tone: "good" }, { label: "That's enough for", value: "1 full video" }] },
        { type: "text", text: "Over the next few days, Ada from our team will send you a few short tips to get your first video out. And if you ever get stuck, just reply to this email — it comes straight to us." },
        { type: "signature", ...FOUNDER },
      ],
      cta: { label: "Make my first video", url: utm("/studio/video", "welcome-0") },
    }),
  },
  {
    kind: "welcome:1",
    from: "Ada from Recktube",
    day: 1,
    subject: () => "Your first video, in 3 steps",
    layout: (p) => ({
      preheader: "I'm Ada — I'll help you get your first video out this week.",
      eyebrow: "Getting started",
      heading: "Let's make your first video",
      intro: `${greet(p)}\n\nI'm Ada from the Recktube team, and like you just heard from Japheth, I'll be your guide over the next few days.\n\nHere's the fastest way to your first video:`,
      blocks: [
        { type: "steps", items: [
          { title: "Pick an idea", text: "Open Ideas — Content Creator shows what's already working in your niche." },
          { title: "Write the script", text: "Tap Write with AI in Script Studio. Edit anything you like." },
          { title: "Generate the video", text: "Tap Generate video: voice-over, visuals, music and captions are added for you." },
        ] },
        { type: "text", text: "Talk to you tomorrow!" },
        { type: "signature", ...GUIDE },
      ],
      cta: { label: "Find my first idea", url: utm("/content-creator", "welcome-1") },
    }),
  },
  {
    kind: "welcome:2",
    from: "Ada from Recktube",
    day: 2,
    where: `NOT ${MADE_VIDEO}`,
    subject: () => "Your 100 credits are waiting",
    layout: (p) => ({
      preheader: "One tap turns your script into a finished video.",
      eyebrow: "Your first video",
      heading: "Your first video is 5 minutes away",
      intro: `${greet(p)}\n\nYou haven't made your first video yet — and that's the fun part. Your 100 free credits cover one complete video: voice-over, visuals, music, captions and a thumbnail.`,
      blocks: [
        { type: "banner", highlight: "100 free credits", title: "ready to use", sub: "One full video · no editing skills needed · works on your phone" },
        { type: "text", text: "Tip: keep your first one short (30–60 seconds). Shorts are the quickest way to learn what your audience likes." },
        { type: "signature", ...GUIDE },
      ],
      cta: { label: "Generate my video", url: utm("/studio/video", "welcome-2") },
    }),
  },
  {
    kind: "welcome:4",
    from: "Ada from Recktube",
    day: 4,
    subject: () => "The niches that pay creators the most",
    layout: (p) => ({
      preheader: "Pick a niche with real demand and strong earning potential.",
      eyebrow: "Grow",
      heading: "Make videos people actually search for",
      intro: `${greet(p)}\n\nThe fastest-growing channels usually have one thing in common: they picked a niche with real demand and good earnings — then posted consistently.`,
      blocks: [
        { type: "steps", items: [
          { title: "Check Most Paying Niches", text: "See niches ranked by earning potential, demand and competition — measured from live YouTube data." },
          { title: "Watch Trend Radar", text: "Spot what's taking off in your niche this week, before everyone else." },
          { title: "Post consistently", text: "Two or three Shorts a week beats one perfect video a month." },
        ] },
        { type: "signature", ...GUIDE },
      ],
      cta: { label: "See paying niches", url: utm("/intelligence/paying-niches", "welcome-4") },
    }),
  },
  {
    kind: "welcome:7",
    from: "Japheth from Recktube",
    day: 7,
    subject: (p) => `${first(p.name) || "Quick question"} — how's it going?`,
    layout: (p) => ({
      preheader: "Reply and tell me what you're making — I read every email.",
      eyebrow: "One week in",
      heading: "How's it going?",
      intro: `${greet(p)}\n\nIt's been a week since you joined Recktube. I'd love to know: what are you making, and what's one thing we could do better?\n\nJust hit reply — your email comes straight to our team, and I read every one.`,
      blocks: [{ type: "signature", ...FOUNDER }],
      cta: { label: "Open Recktube", url: utm("/dashboard", "welcome-7") },
    }),
  },
];

async function welcomeSeries(): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  let sent = 0;
  for (const step of WELCOME_STEPS) {
    // A 3-day window: a missed daily run still sends, but late sign-ups never get old steps in a burst.
    const rows = await db.unsafe(
      `SELECT u.id, u.email, u.name FROM users u
       WHERE ${CONSENT} AND u.created_at <= now() - interval '${step.day} days' AND u.created_at > now() - interval '${step.day + 3} days'
         ${step.where ? `AND ${step.where}` : ""}
         AND NOT EXISTS (SELECT 1 FROM lifecycle_sends l WHERE l.user_id = u.id AND l.kind = '${step.kind}')
       LIMIT ${PER_RUN}`,
    );
    for (const r of rows) {
      const p = { id: String(r.id), email: String(r.email), name: String(r.name ?? "") };
      if (await deliver(p, step.kind, step.subject(p), step.layout(p), step.from)) sent++;
    }
  }
  return sent;
}

/* ---------------- Personal offers (triggered by what people do) ---------------- */

const OFFER_HOURS = 72;
const redeemLink = (code: string, c: string) => utm(`/redeem?code=${encodeURIComponent(code)}`, c);

interface Offer {
  kind: (monthKey: string) => string;
  /** Once per this many days per person (null = once ever). */
  everyDays: number | null;
  credits: number;
  from: string;
  where: string;
  subject: (p: Person) => string;
  layout: (p: Person, code: string, row: Record<string, unknown>) => Omit<Parameters<typeof renderEmail>[0], "appUrl" | "reason" | "unsubscribeUrl">;
}

const OWNER_WS = `SELECT m.workspace_id FROM memberships m WHERE m.user_id = u.id AND m.role = 'owner'`;
const expiresText = `Expires in ${OFFER_HOURS} hours`;

export const OFFERS: Offer[] = [
  {
    // Made videos and nearly out of credits: the moment a bonus matters most.
    kind: (m) => `offer:low:${m}`,
    everyDays: 30,
    credits: 50,
    from: "Japheth from Recktube",
    where: `${MADE_VIDEO}
      AND EXISTS (SELECT 1 FROM credit_accounts a WHERE a.workspace_id IN (${OWNER_WS}) AND NOT a.unlimited AND a.balance <= 10)`,
    subject: () => "You've been busy — here's a bonus 🎁",
    layout: (p, code) => ({
      preheader: `+50 free credits to keep creating — expires in ${OFFER_HOURS} hours.`,
      eyebrow: "Personal bonus",
      heading: "Keep the videos coming",
      intro: `${greet(p)}\n\nI noticed you've been making videos with Recktube and your credits are almost used up. I don't want that to slow you down, so I've unlocked a personal bonus on your account.`,
      blocks: [
        { type: "banner", highlight: "+50 credits", title: "unlocked for you", sub: "Half a video's worth · added in one tap · just for your account" },
        { type: "offer", value: "Your personal bonus: +50 credits", code, expires: expiresText, action: { label: "Claim my 50 credits", url: redeemLink(code, "offer-low") } },
        { type: "text", text: "Your monthly credits also refill automatically every 30 days." },
        { type: "signature", ...FOUNDER },
      ],
    }),
  },
  {
    // Focused on Shorts (most projects are Shorts): tips + a small boost.
    kind: () => "offer:shorts",
    everyDays: null,
    credits: 30,
    from: "Ada from Recktube",
    where: `u.created_at < now() - interval '5 days'
      AND (SELECT count(*) FROM projects pr WHERE pr.workspace_id IN (${OWNER_WS}) AND pr.deleted_at IS NULL
             AND (pr.platform ILIKE '%short%' OR pr.content_type ILIKE '%short%')) >= 2
      AND (SELECT count(*) FROM projects pr WHERE pr.workspace_id IN (${OWNER_WS}) AND pr.deleted_at IS NULL
             AND (pr.platform ILIKE '%short%' OR pr.content_type ILIKE '%short%')) * 2
          >= (SELECT count(*) FROM projects pr WHERE pr.workspace_id IN (${OWNER_WS}) AND pr.deleted_at IS NULL)`,
    subject: () => "I noticed you're making Shorts",
    layout: (p, code) => ({
      preheader: "3 things the fastest-growing Shorts channels do — plus a bonus for you.",
      eyebrow: "Shorts",
      heading: "Your Shorts, but faster-growing",
      intro: `${greet(p)}\n\nI noticed you're focusing on Shorts — that's exactly where most of our fastest-growing creators started. Here's what they do differently:`,
      blocks: [
        { type: "steps", items: [
          { title: "Hook in the first second", text: "Start with the payoff or a bold question — Script Studio's hooks help." },
          { title: "Post often", text: "3–5 Shorts a week. Consistency teaches the algorithm who to show you to." },
          { title: "Ride what's rising", text: "Trend Radar shows what's taking off in your niche this week." },
        ] },
        { type: "offer", value: "Shorts bonus: +30 credits", code, expires: expiresText, action: { label: "Claim my bonus", url: redeemLink(code, "offer-shorts") } },
        { type: "signature", ...GUIDE },
      ],
      cta: { label: "See what's trending", url: utm("/intelligence/trends", "offer-shorts") },
    }),
  },
  {
    // Signed up 10+ days ago and never made a video.
    kind: () => "offer:idle",
    everyDays: null,
    credits: 20,
    from: "Ada from Recktube",
    where: `u.created_at < now() - interval '10 days' AND u.created_at > now() - interval '60 days' AND NOT ${MADE_VIDEO}`,
    subject: () => "Your first video is on us (+20 bonus)",
    layout: (p, code) => ({
      preheader: "Your 100 credits are still waiting — plus a little extra.",
      eyebrow: "Your first video",
      heading: "Let's make that first video",
      intro: `${greet(p)}\n\nYou joined Recktube but haven't made your first video yet. Your 100 free credits are still there — and I've added a small bonus to make it an easy start.`,
      blocks: [
        { type: "banner", highlight: "100 + 20", title: "credits waiting for you", sub: "Pick an idea, tap Generate video — voice, visuals, music and captions are done for you" },
        { type: "offer", value: "Starter bonus: +20 credits", code, expires: expiresText, action: { label: "Claim & start", url: redeemLink(code, "offer-idle") } },
        { type: "signature", ...GUIDE },
      ],
      cta: { label: "Make my first video", url: utm("/studio/video", "offer-idle") },
    }),
  },
];

async function personalOffers(): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const month = new Date().toISOString().slice(0, 7);
  let sent = 0;
  for (const offer of OFFERS) {
    const kind = offer.kind(month);
    const base = kind.replace(/:\d{4}-\d{2}$/, "");
    const recent = offer.everyDays
      ? `AND NOT EXISTS (SELECT 1 FROM lifecycle_sends l WHERE l.user_id = u.id AND l.kind LIKE '${base}%' AND l.sent_at > now() - interval '${offer.everyDays} days')`
      : `AND NOT EXISTS (SELECT 1 FROM lifecycle_sends l WHERE l.user_id = u.id AND l.kind = '${kind}')`;
    const rows = await db.unsafe(`SELECT u.id, u.email, u.name FROM users u WHERE ${CONSENT} AND ${offer.where} ${recent} LIMIT ${PER_RUN}`);
    for (const r of rows) {
      const p = { id: String(r.id), email: String(r.email), name: String(r.name ?? "") };
      try {
        const { code } = await personalCode(p.id, offer.credits, OFFER_HOURS, `${base} offer`);
        if (await deliver(p, kind, offer.subject(p), offer.layout(p, code, r), offer.from)) sent++;
      } catch (error) {
        console.error(`offer ${kind} failed:`, error instanceof Error ? error.message : String(error));
      }
    }
  }
  return sent;
}

export async function lifecycleEmails() {
  const db = getDb();
  if (!db) return { skipped: "no database" };
  const out = { welcome: await welcomeSeries(), offers: await personalOffers(), gettingStarted: 0, comeback: 0, refill: 0 };

  // 1) Day 3+: signed up, never started a project.
  const starters = await db.unsafe(
    `SELECT u.id, u.email, u.name FROM users u
     WHERE ${CONSENT} AND u.created_at < now() - interval '3 days' AND u.created_at > now() - interval '21 days'
       AND NOT EXISTS (SELECT 1 FROM memberships m JOIN projects p ON p.workspace_id = m.workspace_id AND p.deleted_at IS NULL WHERE m.user_id = u.id)
       AND NOT EXISTS (SELECT 1 FROM lifecycle_sends l WHERE l.user_id = u.id AND (l.kind = 'getting-started' OR l.kind LIKE 'welcome:%'))
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

/** Send every offer email to one address, as a preview (sample code, no credits). */
export async function sendOfferPreview(to: string, name: string): Promise<number> {
  const p = { id: "preview", email: to, name };
  let n = 0;
  for (const offer of OFFERS) {
    const unsub = unsubscribeUrl(to, "marketing");
    const mail = renderEmail({ ...offer.layout(p, "BONUS-SAMPLE", {}), appUrl: app(), reason: "Preview of a Recktube offer email (sample code).", unsubscribeUrl: unsub ?? undefined });
    const res = await sendEmail({ to, subject: `[Preview offer] ${offer.subject(p)}`, ...mail, kind: "marketing", fromName: offer.from, fromAddress: "support@recktube.xyz", replyTo: "support@recktube.xyz", listUnsubscribe: unsub ?? undefined });
    if (res.sent) n++;
  }
  return n;
}

/** Send every welcome email to one address, as a preview (no records kept). */
export async function sendWelcomePreview(to: string, name: string): Promise<number> {
  const p = { id: "preview", email: to, name };
  let n = 0;
  for (const step of WELCOME_STEPS) {
    const unsub = unsubscribeUrl(to, "marketing");
    const mail = renderEmail({ ...step.layout(p), appUrl: app(), reason: "Preview of the Recktube welcome series.", unsubscribeUrl: unsub ?? undefined });
    const res = await sendEmail({ to, subject: `[Preview day ${step.day}] ${step.subject(p)}`, ...mail, kind: "marketing", fromName: step.from, fromAddress: "support@recktube.xyz", replyTo: "support@recktube.xyz", listUnsubscribe: unsub ?? undefined });
    if (res.sent) n++;
  }
  return n;
}
