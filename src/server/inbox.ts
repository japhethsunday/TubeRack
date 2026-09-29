import { getServerEnv } from "@/src/lib/env";
import { backendUnavailable, notFound, validationError } from "@/src/server/errors";
import { SECURITY_ADDRESS, SUPPORT_ADDRESS, type Mailbox } from "@/src/server/admin-mail";

/**
 * Admin inbox. ImprovMX forwards support@ / security@ to Gmail and to the
 * Resend receiving address; the admin console reads them from Resend.
 */

export interface InboxSummary {
  id: string;
  from: string;
  fromName: string;
  subject: string;
  mailbox: Mailbox;
  receivedAt: string;
  attachments: number;
}

export interface InboxEmail extends InboxSummary {
  to: string[];
  replyTo: string;
  html: string | null;
  text: string | null;
  messageId: string | null;
  /** Sent by a machine (auto-reply, list, bounce): never answered automatically. */
  automated: boolean;
}

type Raw = Record<string, unknown>;

async function resend(path: string): Promise<Raw> {
  const key = getServerEnv().RESEND_API_KEY;
  if (!key) throw backendUnavailable("Email (RESEND_API_KEY)");
  const res = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (res.status === 404) throw notFound("Email");
  if (!res.ok) {
    console.error("inbox fetch failed:", res.status);
    throw validationError(
      res.status === 401 || res.status === 403
        ? "The email API key can't read received mail. In Resend, give the key Full access."
        : `The email provider returned an error (${res.status}).`,
    );
  }
  return (await res.json()) as Raw;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : []);

/** "Ada <ada@x.com>" → { name: "Ada", address: "ada@x.com" }. */
export function parseAddress(value: string): { name: string; address: string } {
  const m = value.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), address: m[2].trim().toLowerCase() };
  return { name: "", address: value.trim().toLowerCase() };
}

function header(raw: Raw, name: string): string {
  const h = raw.headers;
  if (!h || typeof h !== "object") return "";
  const hit = Object.entries(h as Record<string, unknown>).find(([k]) => k.toLowerCase() === name);
  return hit ? (Array.isArray(hit[1]) ? String(hit[1][0] ?? "") : String(hit[1] ?? "")) : "";
}

/** Which of our addresses it was sent to (the original To/Cc survive forwarding). */
export function mailboxOf(raw: Raw): Mailbox {
  const all = [...list(raw.to), ...list(raw.cc), header(raw, "to"), header(raw, "cc"), header(raw, "delivered-to"), header(raw, "x-original-to")]
    .join(" ")
    .toLowerCase();
  return all.includes(SECURITY_ADDRESS) ? "security" : "support";
}

function summary(raw: Raw): InboxSummary {
  const from = parseAddress(str(raw.from));
  return {
    id: str(raw.id),
    from: from.address,
    fromName: from.name,
    subject: str(raw.subject) || "(no subject)",
    mailbox: mailboxOf(raw),
    receivedAt: str(raw.created_at),
    attachments: Array.isArray(raw.attachments) ? raw.attachments.length : 0,
  };
}

export async function listInbox(after?: string): Promise<{ emails: InboxSummary[]; next: string | null }> {
  const qs = new URLSearchParams({ limit: "50", ...(after ? { after } : {}) });
  const body = await resend(`/emails/receiving?${qs}`);
  const rows = Array.isArray(body.data) ? (body.data as Raw[]) : [];
  const emails = rows.map(summary).filter((e) => e.id);
  return { emails, next: body.has_more && emails.length ? emails[emails.length - 1].id : null };
}

export async function getInboxEmail(id: string): Promise<InboxEmail> {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw notFound("Email");
  const raw = await resend(`/emails/receiving/${encodeURIComponent(id)}`);
  const s = summary(raw);
  // Forwarders may rewrite From; Reply-To keeps the real sender.
  const replyTo = parseAddress(list(raw.reply_to)[0] || header(raw, "reply-to") || s.from).address;
  return {
    ...s,
    to: list(raw.to),
    replyTo,
    html: str(raw.html) || null,
    text: str(raw.text) || null,
    messageId: str(raw.message_id) || header(raw, "message-id") || null,
    automated:
      (header(raw, "auto-submitted") !== "" && header(raw, "auto-submitted").toLowerCase() !== "no") ||
      /bulk|list|junk|auto_reply/i.test(header(raw, "precedence")) ||
      header(raw, "list-id") !== "" ||
      header(raw, "list-unsubscribe") !== "" ||
      header(raw, "x-autoreply") !== "" ||
      header(raw, "x-autorespond") !== "",
  };
}

export const mailboxAddress = (m: Mailbox) => (m === "security" ? SECURITY_ADDRESS : SUPPORT_ADDRESS);
