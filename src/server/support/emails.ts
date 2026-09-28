import { getServerEnv } from "@/src/lib/env";
import { renderEmail, type EmailBlock } from "@/src/server/email-templates";
import { sendEmail, type EmailResult } from "@/src/server/email";
import { adminEmails } from "@/src/server/admin";
import { SUPPORT_ADDRESS } from "@/src/server/admin-mail";
import type { ChatLine } from "@/src/server/support/assistant";

/** Support emails, all on the Recktube design and sent from support@. */

const app = () => getServerEnv().APP_URL.replace(/\/$/, "");
const first = (name: string) => (name.trim().split(/\s+/)[0] ?? "").slice(0, 40);
const hi = (name: string) => (first(name) ? `Hi ${first(name)},` : "Hi there,");
const paragraphs = (s: string): EmailBlock[] => s.split(/\n{2,}/).map((t) => t.trim()).filter(Boolean).map((text) => ({ type: "text", text }));
const chatUrl = () => `${app()}/dashboard?support=open`;

function send(to: string, subject: string, mail: { html: string; text: string }): Promise<EmailResult> {
  return sendEmail({ to, subject, ...mail, kind: "support", fromName: "Recktube Support", fromAddress: SUPPORT_ADDRESS, replyTo: SUPPORT_ADDRESS });
}

/** "We've got your request" — sent when a chat is handed to the team. */
export function sendHandoffConfirmation(to: string, name: string, subject: string): Promise<EmailResult> {
  const mail = renderEmail({
    preheader: "A teammate is looking at your request and will reply soon.",
    eyebrow: "Recktube Support",
    heading: "We've got your request",
    intro: `${hi(name)} thanks for reaching out. A member of the Recktube team is now looking at your conversation about “${subject}”.`,
    blocks: [
      { type: "stats", items: [{ label: "Status", value: "With the team", tone: "hot" }, { label: "Usual reply", value: "Within 24 hours" }] },
      { type: "text", text: "We'll reply in the support chat inside Recktube and by email. You can add more details any time — just reply to this email or open the chat.\n\nThe Recktube team" },
    ],
    cta: { label: "Open the support chat", url: chatUrl() },
    reason: `You're receiving this because you asked Recktube Support for help. Replies reach ${SUPPORT_ADDRESS}.`,
    appUrl: app(),
  });
  return send(to, `We've got your request: ${subject}`, mail);
}

/** A copy of the conversation, on request. */
export function sendTranscript(to: string, name: string, subject: string, lines: ChatLine[]): Promise<EmailResult> {
  const convo = lines
    .filter((l) => l.role !== "system")
    .slice(-40)
    .map((l) => `${l.role === "user" ? "You" : l.role === "admin" ? "Recktube team" : "Recktube Support"}: ${l.body.slice(0, 2000)}`)
    .join("\n\n");
  const mail = renderEmail({
    preheader: `Your conversation with Recktube Support about “${subject}”.`,
    eyebrow: "Recktube Support",
    heading: "Your support conversation",
    intro: `${hi(name)} here's a copy of your conversation with Recktube Support, as you asked.`,
    blocks: [{ type: "heading", text: subject }, ...paragraphs(convo), { type: "text", text: "Need anything else? Reply to this email or open the chat in Recktube.\n\nThe Recktube team" }],
    cta: { label: "Continue in Recktube", url: chatUrl() },
    reason: `You asked for a copy of this support conversation. Replies reach ${SUPPORT_ADDRESS}.`,
    appUrl: app(),
  });
  return send(to, `Your Recktube Support conversation: ${subject}`, mail);
}

/** The assistant decided this answer is worth keeping: email the question + answer. */
export function sendAnswerCopy(to: string, name: string, subject: string, question: string, answer: string): Promise<EmailResult> {
  const clean = answer.replace(/\s*(I've|I have|We've|We have) (also )?emailed (you )?a copy[^.]*\.?\s*$/i, "").trim();
  const mail = renderEmail({
    preheader: clean.slice(0, 120),
    eyebrow: "Recktube Support",
    heading: subject || "Your answer from Recktube Support",
    intro: `${hi(name)} here's a copy of the answer from Recktube Support so you have it handy.`,
    blocks: [
      { type: "callout", title: "You asked", text: question.slice(0, 600) },
      ...paragraphs(clean),
      { type: "text", text: "Need more help? Reply to this email or continue in the support chat.\n\nThe Recktube team" },
    ],
    cta: { label: "Continue in Recktube", url: chatUrl() },
    reason: `You're receiving this because you asked Recktube Support for help. Replies reach ${SUPPORT_ADDRESS}.`,
    appUrl: app(),
  });
  return send(to, `Recktube Support: ${subject || "your answer"}`, mail);
}

/** A teammate's answer, sent when the admin replies in the console. */
export function sendTeamReply(to: string, name: string, subject: string, message: string): Promise<EmailResult> {
  const mail = renderEmail({
    preheader: message.slice(0, 120),
    eyebrow: "Recktube Support",
    heading: hi(name),
    blocks: [...paragraphs(message), { type: "text", text: "The Recktube Support team" }],
    cta: { label: "Reply in the support chat", url: chatUrl() },
    reason: `You can reply to this email — it reaches the Recktube support team at ${SUPPORT_ADDRESS}.`,
    appUrl: app(),
  });
  return send(to, `Re: ${subject}`, mail);
}

/** Tell the team a chat needs a person. */
export async function alertTeam(conversationId: string, userEmail: string, subject: string, summary: string): Promise<void> {
  const mail = renderEmail({
    preheader: summary.slice(0, 120),
    eyebrow: "Support hand-over",
    heading: "A creator needs a teammate",
    intro: `${userEmail} was handed over by the support assistant.`,
    blocks: [{ type: "callout", title: subject, text: summary || "See the conversation." }],
    cta: { label: "Open in the admin console", url: `${app()}/admin/support?c=${encodeURIComponent(conversationId)}` },
    reason: "You're receiving this because you're a Recktube admin.",
    appUrl: app(),
  });
  for (const admin of adminEmails()) {
    await sendEmail({ to: admin, subject: `Support hand-over: ${subject}`, ...mail, kind: "support", fromName: "Recktube Support", fromAddress: SUPPORT_ADDRESS, replyTo: userEmail });
  }
}
