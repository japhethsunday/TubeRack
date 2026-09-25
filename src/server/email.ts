import { getServerEnv } from "@/src/lib/env";
import { renderEmail, type EmailBlock } from "@/src/server/email-templates";

/**
 * Transactional email through Resend (RESEND_API_KEY, EMAIL_FROM).
 * Never throws into auth flows: failures are reported as `sent: false`
 * so responses stay identical whether or not an account exists.
 */

export interface EmailRequest {
  to: string;
  subject: string;
  text: string;
  html?: string;
  kind: "verify" | "recovery" | "security" | "digest" | "reminder" | "welcome" | "alert";
}

export interface EmailResult {
  sent: boolean;
  reason: string;
}

let outbox: EmailRequest[] = [];

export async function sendEmail(request: EmailRequest): Promise<EmailResult> {
  const env = getServerEnv();
  if (!env.RESEND_API_KEY) return { sent: false, reason: "Email is not configured (RESEND_API_KEY)." };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [request.to],
        subject: request.subject,
        text: request.text,
        ...(request.html ? { html: request.html } : {}),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      console.error("email send failed:", response.status);
      return { sent: false, reason: `Email provider rejected the message (${response.status}).` };
    }
    return { sent: true, reason: "sent" };
  } catch (error) {
    console.error("email send failed:", error instanceof Error ? error.message : String(error));
    return { sent: false, reason: "Email provider unreachable." };
  }
}

/** Branded single-action email on the shared design (kept for simple notices). */
export function actionEmail(opts: {
  heading: string;
  body: string;
  action: string;
  url: string;
  footer: string;
  eyebrow?: string;
  preheader?: string;
  blocks?: EmailBlock[];
}): { text: string; html: string } {
  let appUrl = getServerEnv().APP_URL;
  try {
    appUrl = new URL(opts.url).origin;
  } catch {
    // keep APP_URL
  }
  return renderEmail({
    preheader: opts.preheader ?? opts.body.split("\n")[0].slice(0, 140),
    eyebrow: opts.eyebrow,
    heading: opts.heading,
    intro: opts.body,
    blocks: opts.blocks,
    cta: { label: opts.action, url: opts.url },
    reason: opts.footer,
    appUrl,
  });
}

/** Public origin for links: the site the request came from (works on previews). */
export function linkOrigin(request: Request): string {
  const env = getServerEnv();
  try {
    return new URL(request.url).origin;
  } catch {
    return env.APP_URL.replace(/\/$/, "");
  }
}

export async function sendVerificationEmail(request: Request, to: string, token: string): Promise<EmailResult> {
  const url = `${linkOrigin(request)}/verify-email?token=${encodeURIComponent(token)}`;
  const mail = actionEmail({
    eyebrow: "Account",
    heading: "Confirm your email",
    preheader: "One click to activate your TubeRack account.",
    body: "You're one step away from your studio. Confirm this address to secure your account — the link expires in 24 hours.",
    action: "Verify my email",
    url,
    footer: "If you didn't create a TubeRack account, you can ignore this email.",
  });
  return sendEmail({ to, subject: "Verify your TubeRack email", kind: "verify", ...mail });
}

/** Sent instead of a verification link when the address already has an account. */
export async function sendAccountExistsEmail(request: Request, to: string): Promise<EmailResult> {
  const mail = actionEmail({
    eyebrow: "Security",
    heading: "You already have an account",
    body: "Someone (hopefully you) tried to create a TubeRack account with this email. You already have one — sign in, or reset your password if you forgot it.",
    action: "Sign in",
    url: `${linkOrigin(request)}/login`,
    footer: "If this wasn't you, no action is needed; your account was not changed.",
  });
  return sendEmail({ to, subject: "Your TubeRack account", kind: "security", ...mail });
}

export async function sendRecoveryEmail(request: Request, to: string, token: string): Promise<EmailResult> {
  const url = `${linkOrigin(request)}/reset-password?token=${encodeURIComponent(token)}`;
  const mail = actionEmail({
    eyebrow: "Security",
    heading: "Reset your password",
    preheader: "Your password reset link (valid for 60 minutes).",
    body: "Someone asked to reset the password for this TubeRack account. The link expires in 60 minutes and works once.",
    action: "Choose a new password",
    url,
    footer: "If you did not ask for this, ignore this email — your password stays the same.",
  });
  return sendEmail({ to, subject: "Reset your TubeRack password", kind: "recovery", ...mail });
}

/** Welcome, sent once the email is verified: what to do first. */
export async function sendWelcomeEmail(request: Request, to: string, name?: string): Promise<EmailResult> {
  const app = linkOrigin(request);
  const mail = renderEmail({
    preheader: "Your studio is ready — here's the fastest path to your first video.",
    eyebrow: "Welcome",
    heading: name ? `Welcome to TubeRack, ${name.split(" ")[0]}` : "Welcome to TubeRack",
    intro: "Your studio is ready. Here's the fastest path from idea to a published video:",
    blocks: [
      {
        type: "steps",
        items: [
          { title: "Find a niche that pays", text: "Most Paying Niches and Niche Finder show real demand, competition and what advertisers spend." },
          { title: "Build your channel plan", text: "Channel Creator writes your name, positioning, brand and 30 video ideas from live data." },
          { title: "Script, voice and visuals", text: "Write the script, voice every scene in one take and generate images for each scene." },
          { title: "Edit, package and publish", text: "Cut it in the Video Studio, create the thumbnail and title, and publish straight to YouTube." },
        ],
      },
      { type: "callout", title: "Pro tip", text: "Start with one idea from your channel plan and take it all the way to publish today. Momentum beats perfection.", action: { label: "Open Channel Creator", url: `${app}/channel-creator` } },
    ],
    cta: { label: "Open my studio", url: `${app}/dashboard` },
    reason: "You're receiving this because you just created a TubeRack account.",
    appUrl: app,
  });
  return sendEmail({ to, subject: "Welcome to TubeRack — your studio is ready", kind: "welcome", ...mail });
}

/** For tests: inspect recorded attempts (memory only, never persisted). */
export function __outbox(): EmailRequest[] {
  return outbox;
}

export function __recordAttempt(request: EmailRequest): void {
  outbox = [...outbox.slice(-49), request];
}

export function __resetOutbox(): void {
  outbox = [];
}
