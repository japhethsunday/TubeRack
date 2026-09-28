import { renderEmail, type EmailBlock } from "@/src/server/email-templates";

/**
 * Hand-sent emails from the admin console, on the Recktube design. Support
 * mail replies to support@recktube.xyz and security mail to
 * security@recktube.xyz (both forward to the owner's inbox).
 */

export const SUPPORT_ADDRESS = "support@recktube.xyz";
export const SECURITY_ADDRESS = "security@recktube.xyz";

export type Mailbox = "support" | "security";

export interface TemplateField {
  key: string;
  label: string;
  multiline?: boolean;
  placeholder?: string;
  optional?: boolean;
}

export interface AdminTemplate {
  id: string;
  name: string;
  mailbox: Mailbox;
  description: string;
  fields: TemplateField[];
  build: (f: Record<string, string>, app: string) => { subject: string; html: string; text: string };
}

const NAME: TemplateField = { key: "name", label: "Recipient's first name", placeholder: "Ada", optional: true };
const hi = (f: Record<string, string>) => (f.name?.trim() ? `Hi ${f.name.trim()},` : "Hi there,");
const paragraphs = (s: string): EmailBlock[] => s.split(/\n{2,}/).map((t) => t.trim()).filter(Boolean).map((text) => ({ type: "text", text }));

function mail(mailbox: Mailbox, app: string, subject: string, layout: Omit<Parameters<typeof renderEmail>[0], "appUrl" | "reason"> & { reason?: string }) {
  const reply = mailbox === "security" ? SECURITY_ADDRESS : SUPPORT_ADDRESS;
  const out = renderEmail({
    ...layout,
    reason: layout.reason ?? `You can reply to this email — it reaches the Recktube ${mailbox} team at ${reply}.`,
    appUrl: app,
  });
  return { subject, ...out };
}

export const ADMIN_TEMPLATES: AdminTemplate[] = [
  {
    id: "support-reply",
    name: "Support reply",
    mailbox: "support",
    description: "Answer a question or help request.",
    fields: [NAME, { key: "subject", label: "Subject", placeholder: "Re: your question about exports" }, { key: "message", label: "Your answer", multiline: true, placeholder: "Thanks for reaching out…" }],
    build: (f, app) =>
      mail("support", app, f.subject?.trim() || "An update from Recktube Support", {
        preheader: (f.message ?? "").slice(0, 120),
        eyebrow: "Recktube Support",
        heading: hi(f),
        blocks: [...paragraphs(f.message ?? ""), { type: "text", text: "If anything is still unclear, just reply — we read every message.\n\nThe Recktube team" }],
        cta: { label: "Open Recktube", url: `${app}/dashboard` },
      }),
  },
  {
    id: "issue-fixed",
    name: "Issue fixed",
    mailbox: "support",
    description: "Tell someone the problem they reported is fixed.",
    fields: [NAME, { key: "issue", label: "What was fixed", placeholder: "Voice-overs not playing on mobile" }, { key: "details", label: "Details (optional)", multiline: true, optional: true }],
    build: (f, app) =>
      mail("support", app, `Fixed: ${f.issue?.trim() || "the issue you reported"}`, {
        preheader: `Good news — ${f.issue?.trim() || "the issue you reported"} is fixed.`,
        eyebrow: "Recktube Support",
        heading: "Good news — it's fixed",
        intro: `${hi(f)} thanks for letting us know about this. It's now fixed for everyone.`,
        blocks: [
          { type: "callout", title: "Fixed", text: f.issue?.trim() || "The issue you reported." },
          ...paragraphs(f.details ?? ""),
          { type: "text", text: "Reports like yours make Recktube better for every creator. If you notice anything else, just reply.\n\nThe Recktube team" },
        ],
        cta: { label: "Try it now", url: `${app}/dashboard` },
      }),
  },
  {
    id: "credits-added",
    name: "Credits added",
    mailbox: "support",
    description: "Let someone know you topped up their credits.",
    fields: [NAME, { key: "amount", label: "Credits added", placeholder: "500" }, { key: "reason", label: "Reason (optional)", placeholder: "A thank-you for your feedback", optional: true }],
    build: (f, app) =>
      mail("support", app, `🎁 ${f.amount?.trim() || "Bonus"} credits added to your Recktube account`, {
        preheader: `We've added ${f.amount?.trim() || "bonus"} credits to your account.`,
        eyebrow: "Credits",
        heading: `${f.amount?.trim() || "Bonus"} credits are yours`,
        intro: `${hi(f)} we've added ${f.amount?.trim() || "bonus"} credits to your Recktube account${f.reason?.trim() ? ` — ${f.reason.trim().replace(/\.$/, "")}` : ""}. They're ready to use right now.`,
        blocks: [
          { type: "stats", items: [{ label: "Credits added", value: `+${f.amount?.trim() || "—"}`, tone: "good" }, { label: "Expires", value: "Never" }] },
          { type: "text", text: "Use them for scripts, voice-overs, thumbnails and AI video. Credits are only used when a generation succeeds." },
        ],
        cta: { label: "Start creating", url: `${app}/dashboard` },
      }),
  },
  {
    id: "welcome-personal",
    name: "Personal welcome",
    mailbox: "support",
    description: "A personal hello to a new creator.",
    fields: [NAME, { key: "note", label: "Personal note (optional)", multiline: true, optional: true }],
    build: (f, app) =>
      mail("support", app, "Welcome to Recktube — a quick hello", {
        preheader: "Three quick ways to get your first video made.",
        eyebrow: "Welcome",
        heading: `${hi(f).replace(",", "")} — welcome to Recktube`,
        intro: "I'm glad you're here. Recktube takes you from an idea to a finished, published YouTube video in one place. Here's the fastest way to start:",
        blocks: [
          {
            type: "steps",
            items: [
              { title: "Pick a winning idea", text: "Content Creator studies what's working in your niche right now." },
              { title: "Generate the video", text: "Script, voice-over, visuals, music, captions and thumbnail — in one click." },
              { title: "Publish and learn", text: "Publish to YouTube and watch the results in Analytics." },
            ],
          },
          ...paragraphs(f.note ?? ""),
          { type: "text", text: "If you get stuck or have an idea, reply to this email — it comes straight to me.\n\nThe Recktube team" },
        ],
        cta: { label: "Make my first video", url: `${app}/content-creator` },
      }),
  },
  {
    id: "account-suspended",
    name: "Account suspended",
    mailbox: "support",
    description: "Explain why an account was suspended.",
    fields: [NAME, { key: "reason", label: "Reason", multiline: true, placeholder: "Repeated uploads of content you don't own the rights to." }],
    build: (f, app) =>
      mail("support", app, "Your Recktube account has been suspended", {
        preheader: "Your account is suspended. Here's why and what you can do.",
        eyebrow: "Account notice",
        heading: "Your account has been suspended",
        intro: `${hi(f)} we've suspended your Recktube account because it didn't follow our Terms of Service.`,
        blocks: [
          { type: "callout", title: "Reason", text: f.reason?.trim() || "A violation of our Terms of Service." },
          { type: "text", text: "Your projects are kept safe while the account is suspended. If you think this is a mistake, reply to this email with any details and we'll review it." },
        ],
        cta: { label: "Read our Terms", url: `${app}/terms` },
      }),
  },
  {
    id: "account-reactivated",
    name: "Account reactivated",
    mailbox: "support",
    description: "Tell someone their account is active again.",
    fields: [NAME],
    build: (f, app) =>
      mail("support", app, "Your Recktube account is active again", {
        preheader: "You can sign in and pick up where you left off.",
        eyebrow: "Account notice",
        heading: "Welcome back",
        intro: `${hi(f)} your Recktube account is active again. All your projects are exactly where you left them.`,
        cta: { label: "Sign in", url: `${app}/login` },
      }),
  },
  {
    id: "security-received",
    name: "Security report received",
    mailbox: "security",
    description: "Acknowledge a security report.",
    fields: [NAME, { key: "reference", label: "Reference", placeholder: "SEC-2026-001" }, { key: "summary", label: "Summary of the report", multiline: true, optional: true }],
    build: (f, app) =>
      mail("security", app, `We received your security report (${f.reference?.trim() || "ref pending"})`, {
        preheader: "Thank you — we're looking into it.",
        eyebrow: "Recktube Security",
        heading: "Thank you for your report",
        intro: `${hi(f)} thank you for reporting this responsibly. We take every report seriously and are investigating now.`,
        blocks: [
          { type: "stats", items: [{ label: "Reference", value: f.reference?.trim() || "—" }, { label: "Status", value: "Investigating", tone: "hot" }] },
          ...(f.summary?.trim() ? [{ type: "callout" as const, title: "Your report", text: f.summary.trim() }] : []),
          { type: "text", text: "We'll update you when we've confirmed the issue and again when it's fixed. Please keep the details private until then.\n\nRecktube Security" },
        ],
      }),
  },
  {
    id: "security-resolved",
    name: "Security issue resolved",
    mailbox: "security",
    description: "Close the loop on a security report.",
    fields: [NAME, { key: "reference", label: "Reference", placeholder: "SEC-2026-001" }, { key: "fix", label: "What we fixed", multiline: true }],
    build: (f, app) =>
      mail("security", app, `Resolved: security report ${f.reference?.trim() || ""}`.trim(), {
        preheader: "The issue you reported is fixed.",
        eyebrow: "Recktube Security",
        heading: "The issue is fixed",
        intro: `${hi(f)} the issue you reported has been fixed and deployed. Thank you for helping keep Recktube creators safe.`,
        blocks: [
          { type: "stats", items: [{ label: "Reference", value: f.reference?.trim() || "—" }, { label: "Status", value: "Resolved", tone: "good" }] },
          ...(f.fix?.trim() ? [{ type: "callout" as const, title: "What we fixed", text: f.fix.trim() }] : []),
          { type: "text", text: "You're welcome to verify the fix. If you find anything else, reply to this email.\n\nRecktube Security" },
        ],
      }),
  },
  {
    id: "security-notice",
    name: "Security notice to a user",
    mailbox: "security",
    description: "Warn a user about suspicious activity on their account.",
    fields: [NAME, { key: "what", label: "What happened", multiline: true, placeholder: "We noticed a sign-in from a new device and signed you out of all devices as a precaution." }],
    build: (f, app) =>
      mail("security", app, "Important: security notice for your Recktube account", {
        preheader: "Please review recent activity on your account.",
        eyebrow: "Recktube Security",
        heading: "Please check your account",
        intro: `${hi(f)} we're contacting you about recent activity on your Recktube account.`,
        blocks: [
          { type: "callout", title: "What happened", text: f.what?.trim() || "We noticed unusual activity on your account." },
          {
            type: "steps",
            items: [
              { title: "Reset your password", text: "Choose a new password you don't use anywhere else." },
              { title: "Review your devices", text: "In Settings → Security, sign out any device you don't recognise." },
              { title: "Reply if it wasn't you", text: "We'll help you secure the account." },
            ],
          },
        ],
        cta: { label: "Reset my password", url: `${app}/forgot-password` },
      }),
  },
  {
    id: "custom",
    name: "Custom message",
    mailbox: "support",
    description: "Write anything, on the Recktube design.",
    fields: [
      NAME,
      { key: "subject", label: "Subject" },
      { key: "heading", label: "Heading" },
      { key: "message", label: "Message", multiline: true },
      { key: "button", label: "Button label (optional)", optional: true, placeholder: "Open Recktube" },
      { key: "link", label: "Button link (optional)", optional: true, placeholder: "https://www.recktube.xyz/dashboard" },
    ],
    build: (f, app) => {
      const link = /^https:\/\//.test(f.link?.trim() ?? "") ? f.link.trim() : `${app}/dashboard`;
      return mail("support", app, f.subject?.trim() || "A message from Recktube", {
        preheader: (f.message ?? "").slice(0, 120),
        eyebrow: "Recktube",
        heading: f.heading?.trim() || hi(f),
        intro: f.heading?.trim() ? hi(f) : undefined,
        blocks: [...paragraphs(f.message ?? ""), { type: "text", text: "The Recktube team" }],
        cta: f.button?.trim() ? { label: f.button.trim(), url: link } : undefined,
      });
    },
  },
];

export function templateById(id: string): AdminTemplate | undefined {
  return ADMIN_TEMPLATES.find((t) => t.id === id);
}

/** Missing required fields for a template (by label). */
export function missingFields(t: AdminTemplate, fields: Record<string, string>): string[] {
  return t.fields.filter((f) => !f.optional && !(fields[f.key] ?? "").trim()).map((f) => f.label);
}

/** A reply from the admin inbox, on the Recktube design, quoting the original. */
export function buildReply(
  mailbox: Mailbox,
  app: string,
  r: { subject: string; message: string; name?: string; quoted?: string | null; quotedFrom: string; receivedAt: string },
): { subject: string; html: string; text: string } {
  const subject = /^re:/i.test(r.subject.trim()) ? r.subject.trim() : `Re: ${r.subject.trim() || "your message"}`;
  const quote = (r.quoted ?? "").replace(/\r/g, "").trim().slice(0, 1500);
  let when = r.receivedAt;
  try {
    when = new Date(r.receivedAt).toUTCString().replace(" GMT", " UTC");
  } catch {
    // keep as-is
  }
  return mail(mailbox, app, subject, {
    preheader: r.message.slice(0, 120),
    eyebrow: mailbox === "security" ? "Recktube Security" : "Recktube Support",
    heading: hi({ name: r.name ?? "" }),
    blocks: [
      ...paragraphs(r.message),
      { type: "text", text: mailbox === "security" ? "Recktube Security" : "The Recktube Support team" },
      ...(quote ? ([{ type: "divider" }, { type: "text", text: `On ${when}, ${r.quotedFrom} wrote:\n\n${quote}${(r.quoted ?? "").length > 1500 ? "\n…" : ""}` }] as EmailBlock[]) : []),
    ],
  });
}
