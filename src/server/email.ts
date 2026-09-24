import { getServerEnv } from "@/src/lib/env";

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
  kind: "verify" | "recovery" | "security" | "digest" | "reminder";
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

const escape = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

/** Branded action email (one button + plain-text fallback). */
export function actionEmail(opts: { heading: string; body: string; action: string; url: string; footer: string }): { text: string; html: string } {
  const text = `${opts.heading}\n\n${opts.body}\n\n${opts.action}: ${opts.url}\n\n${opts.footer}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b">
<div style="max-width:480px;margin:32px auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #e4e4e7">
<p style="margin:0 0 24px;font-weight:600;font-size:15px">TubeRack</p>
<h1 style="margin:0 0 12px;font-size:22px">${escape(opts.heading)}</h1>
<p style="margin:0 0 24px;line-height:1.6;color:#52525b;white-space:pre-line">${escape(opts.body)}</p>
<a href="${escape(opts.url)}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:14px">${escape(opts.action)}</a>
<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#a1a1aa">${escape(opts.footer)}<br>${escape(opts.url)}</p>
</div></body></html>`;
  return { text, html };
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
    heading: "Confirm your email",
    body: "Confirm this address to secure your TubeRack account. The link expires in 24 hours.",
    action: "Verify email",
    url,
    footer: "If you did not create a TubeRack account, you can ignore this email.",
  });
  return sendEmail({ to, subject: "Verify your TubeRack email", kind: "verify", ...mail });
}

export async function sendRecoveryEmail(request: Request, to: string, token: string): Promise<EmailResult> {
  const url = `${linkOrigin(request)}/reset-password?token=${encodeURIComponent(token)}`;
  const mail = actionEmail({
    heading: "Reset your password",
    body: "Someone asked to reset the password for this TubeRack account. The link expires in 60 minutes and works once.",
    action: "Choose a new password",
    url,
    footer: "If you did not ask for this, ignore this email — your password stays the same.",
  });
  return sendEmail({ to, subject: "Reset your TubeRack password", kind: "recovery", ...mail });
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
