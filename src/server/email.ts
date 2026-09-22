/**
 * Email boundary. No provider is connected (Resend comes later), so this
 * module records intent and reports unavailability. Verification/recovery
 * token workflows function fully; only delivery waits on a provider.
 * Nothing here ever claims an email was sent.
 */

export interface EmailRequest {
  to: string;
  subject: string;
  text: string;
  kind: "verify" | "recovery" | "security";
}

export interface EmailResult {
  sent: boolean;
  reason: string;
}

let outbox: EmailRequest[] = [];

/** Attempt delivery. Always reports unsent until a provider connects. */
export async function sendEmail(request: EmailRequest): Promise<EmailResult> {
  void request;
  return { sent: false, reason: "No email provider is configured. Connect Resend (later phase) to deliver." };
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
