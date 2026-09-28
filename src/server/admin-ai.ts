import { GeminiTextProvider, isTextConfigured } from "@/src/server/ai/gemini";
import { getDb } from "@/src/server/db";
import { backendUnavailable, validationError } from "@/src/server/errors";
import type { AdminTemplate, Mailbox } from "@/src/server/admin-mail";

/**
 * AI writing for the admin console: reply drafts for inbox mail and
 * filled-in email templates. Drafts are only suggestions — the admin reviews
 * and edits before anything is sent.
 */

/** What the assistant may say about Recktube. Facts outside this list must not be promised. */
const PRODUCT_FACTS = `About Recktube (recktube.xyz): an all-in-one studio for YouTube creators.
- Tools: Content Creator (video ideas from what's working in a niche), Channel Creator (channel name, positioning, branding, first 30 ideas), Script Studio, voice-overs, AI visuals and video, music, captions, thumbnails, titles/descriptions/tags, a full video editor with export, publishing and scheduling to YouTube, Analytics, Trend Radar with daily email briefs, competitor tracking, thumbnail A/B tests, content calendar, Storage for every generated asset.
- Credits: every account gets 500 free credits that refill every 30 days. Costs: text 1, research 2, transcription or voice-over 3, image 5, AI video 20. Credits are only used when a generation succeeds. Admins can add bonus credits.
- Password reset: on the sign-in page choose "Forgot password?", enter the account email, then type the 6-digit code we email (valid 15 minutes). Other devices are signed out after a reset.
- Email verification: new accounts confirm their email from a link (valid 24 hours).
- YouTube: channels connect with Google sign-in; if access is lost (password change or access removed in the Google account), reconnect from the YouTube page.
- Email preferences and notifications live in Settings. Briefs have a one-click unsubscribe.
- Account deletion: Settings → Account, or the team can delete it on request.
- Privacy: cached YouTube data is deleted after 30 days; data is never sold.
- Support: support@recktube.xyz. Security reports: security@recktube.xyz.`;

const RULES = `Writing rules:
- Sound like a friendly, competent human on the Recktube team. Warm, direct, plain English. No corporate filler, no "I hope this email finds you well".
- Answer exactly what the person asked or reported, in order. Acknowledge their situation in one short line first.
- Use only the facts above and the account context given. Never invent features, prices, refunds, timelines, fixes or account changes. If something needs checking, say the team is looking into it and what happens next.
- If they report a bug: thank them, restate it briefly, say what they can try now (if a fact above applies) and that the team is on it.
- Security reports: thank them, confirm receipt, never confirm or deny a vulnerability's details, say the security team will follow up.
- Angry messages: stay calm, apologise for the experience without admitting fault you can't confirm, focus on fixing it.
- Keep it short: 2–5 short paragraphs, each 1–3 sentences. Use a numbered list only for step-by-step instructions.
- Do NOT include a greeting line ("Hi …") or a sign-off/signature — the email design adds both.
- Reply in the same language the person wrote in.
- Never mention AI, models or vendors.`;

function writer() {
  if (!isTextConfigured()) throw backendUnavailable("AI writing");
  return new GeminiTextProvider();
}

/** Pull the first JSON object out of a model reply. */
export function parseJsonObject(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw validationError("The writer returned an unreadable draft. Try again.");
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw validationError("The writer returned an unreadable draft. Try again.");
  }
}

/** Short, factual context about the sender's Recktube account (if they have one). */
export async function accountContext(email: string): Promise<string> {
  const db = getDb();
  if (!db || !email) return "The sender has no Recktube account under this address.";
  try {
    const [u] = await db`
      SELECT u.name, u.status, u.email_verified_at, u.created_at,
        (SELECT count(*) FROM memberships m JOIN projects p ON p.workspace_id = m.workspace_id AND p.deleted_at IS NULL WHERE m.user_id = u.id) AS projects,
        (SELECT count(*) FROM memberships m JOIN channels c ON c.workspace_id = m.workspace_id AND c.deleted_at IS NULL WHERE m.user_id = u.id) AS channels
      FROM users u WHERE lower(u.email) = ${email.toLowerCase()} AND u.deleted_at IS NULL LIMIT 1
    `;
    if (!u) return "The sender has no Recktube account under this address.";
    return [
      `The sender has a Recktube account: name "${String(u.name || "unknown")}", status ${String(u.status)}, email ${u.email_verified_at ? "verified" : "NOT verified yet"},`,
      `joined ${new Date(String(u.created_at)).toDateString()}, ${Number(u.projects)} project(s), ${Number(u.channels) > 0 ? "YouTube connected" : "no YouTube channel connected"}.`,
    ].join(" ");
  } catch {
    return "Account details are unavailable right now.";
  }
}

const clip = (s: string | null | undefined, n: number) => (s ?? "").replace(/\r/g, "").trim().slice(0, n);

/** Draft a reply to a received email. */
export async function draftInboxReply(input: {
  mailbox: Mailbox;
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
  instruction?: string;
}): Promise<{ name: string; message: string }> {
  const account = await accountContext(input.fromEmail);
  const team = input.mailbox === "security" ? "Recktube Security team" : "Recktube Support team";
  const prompt = `You are writing an email reply on behalf of the ${team}.

${PRODUCT_FACTS}

Account context: ${account}

${RULES}
${input.instruction?.trim() ? `\nThe admin's instructions for this reply (follow them exactly; they override the defaults): ${clip(input.instruction, 800)}\n` : ""}
The email you are replying to:
From: ${clip(input.fromName, 80) || "(no name)"} <${input.fromEmail}>
Subject: ${clip(input.subject, 200)}
---
${clip(input.body, 6000) || "(empty message)"}
---

Respond ONLY with JSON: {"name":"the sender's first name if you can tell it from the email or account, else empty","message":"the reply body, paragraphs separated by a blank line"}`;
  const { text } = await writer().generateText({ prompt, maxTokens: 1200, json: true });
  const out = parseJsonObject(text);
  const message = String(out.message ?? "").trim();
  if (!message) throw validationError("The writer returned an empty draft. Try again.");
  return { name: String(out.name ?? "").trim().split(/\s+/)[0]?.slice(0, 40) ?? "", message: message.slice(0, 8000) };
}

/** Fill a branded template's fields from a plain-language instruction. */
export async function draftTemplateFields(input: {
  template: AdminTemplate;
  instruction: string;
  recipientEmail?: string;
  current: Record<string, string>;
}): Promise<Record<string, string>> {
  const account = input.recipientEmail ? await accountContext(input.recipientEmail) : "No recipient chosen yet.";
  const fields = input.template.fields
    .map((f) => `- "${f.key}": ${f.label}${f.multiline ? " (can be several short paragraphs)" : " (one short line)"}${f.optional ? " — optional, leave empty if not needed" : ""}`)
    .join("\n");
  const prompt = `You are filling in the "${input.template.name}" email template (${input.template.description}) for the ${
    input.template.mailbox === "security" ? "Recktube Security team" : "Recktube Support team"
  }. The design already adds the greeting, the headline, a button and the sign-off — you only write the field values.

${PRODUCT_FACTS}

Recipient account context: ${account}

${RULES}

What the admin wants this email to say: ${clip(input.instruction, 1200)}

Current values (keep any that already fit, improve the rest): ${JSON.stringify(input.current).slice(0, 3000)}

Fields to fill:
${fields}
For "name" use only the recipient's first name (from the account context or the instruction), or empty.
For a "reference" field keep the current value unless the admin gives one.
For "amount" fields use digits only.

Respond ONLY with JSON mapping each field key to its value, e.g. {"name":"Ada","message":"..."}`;
  const { text } = await writer().generateText({ prompt, maxTokens: 1500, json: true });
  const out = parseJsonObject(text);
  const filled: Record<string, string> = {};
  for (const f of input.template.fields) {
    const v = out[f.key];
    filled[f.key] = typeof v === "string" ? v.trim().slice(0, 4000) : input.current[f.key] ?? "";
  }
  return filled;
}
