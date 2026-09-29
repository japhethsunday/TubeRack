import { renderEmail, type EmailBlock } from "@/src/server/email-templates";

/**
 * Hand-sent emails from the admin console, on the Recktube design. Support
 * mail replies to support@recktube.xyz and security mail to
 * security@recktube.xyz (both forward to the owner's inbox).
 */

export const SUPPORT_ADDRESS = "support@recktube.xyz";
export const SECURITY_ADDRESS = "security@recktube.xyz";

export const OWNER_ADDRESS = "owner@recktube.xyz";
export const FOUNDER_ADDRESS = "founder@recktube.xyz";

export type Mailbox = "support" | "security" | "owner" | "founder";
export const MAILBOXES: Mailbox[] = ["support", "security", "founder", "owner"];

export const MAILBOX_ADDRESS: Record<Mailbox, string> = { support: SUPPORT_ADDRESS, security: SECURITY_ADDRESS, owner: OWNER_ADDRESS, founder: FOUNDER_ADDRESS };
/** How mail from each address is signed. */
export const MAILBOX_SENDER: Record<Mailbox, { name: string; signoff: string }> = {
  support: { name: "Recktube Support", signoff: "The Recktube Support team" },
  security: { name: "Recktube Security", signoff: "Recktube Security" },
  founder: { name: "Recktube Founder", signoff: "The founder of Recktube" },
  owner: { name: "Recktube", signoff: "The Recktube team" },
};

export interface TemplateField {
  key: string;
  label: string;
  multiline?: boolean;
  placeholder?: string;
  optional?: boolean;
  /** Pre-filled when the template is opened ({{ref}} becomes a fresh reference like SEC-20260928-4821). */
  default?: string;
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
  const reply = MAILBOX_ADDRESS[mailbox];
  const out = renderEmail({
    ...layout,
    reason: layout.reason ?? `You can reply to this email — it reaches Recktube at ${reply}.`,
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
    fields: [NAME, { key: "subject", label: "Subject", placeholder: "Re: your question about exports", default: "Re: your message to Recktube Support" }, { key: "message", label: "Your answer", multiline: true, placeholder: "Thanks for reaching out…", default: "Thanks for reaching out, and sorry for the wait.\n\nWe've looked into your question and here's what you need to know: everything in your account is working normally, and your projects are safe.\n\nIf anything still doesn't look right, reply with a screenshot and we'll take it from there." }],
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
    fields: [NAME, { key: "issue", label: "What was fixed", placeholder: "Voice-overs not playing on mobile", default: "The issue you reported" }, { key: "details", label: "Details (optional)", multiline: true, optional: true }],
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
    fields: [NAME, { key: "amount", label: "Credits added", placeholder: "500", default: "500" }, { key: "reason", label: "Reason (optional)", placeholder: "A thank-you for your feedback", optional: true, default: "A thank-you for being one of our early creators" }],
    build: (f, app) =>
      mail("support", app, `${f.amount?.trim() || "Bonus"} credits added to your Recktube account`, {
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
    fields: [NAME, { key: "reason", label: "Reason", multiline: true, placeholder: "Repeated uploads of content you don't own the rights to.", default: "Repeated uploads of content you don't own the rights to." }],
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
    fields: [NAME, { key: "reference", label: "Reference", placeholder: "SEC-2026-001", default: "{{ref}}" }, { key: "summary", label: "Summary of the report", multiline: true, optional: true }],
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
    fields: [NAME, { key: "reference", label: "Reference", placeholder: "SEC-2026-001", default: "{{ref}}" }, { key: "fix", label: "What we fixed", multiline: true, default: "We patched the issue you reported, confirmed the fix in production and checked that no accounts were affected." }],
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
    fields: [NAME, { key: "what", label: "What happened", multiline: true, placeholder: "We noticed a sign-in from a new device and signed you out of all devices as a precaution.", default: "We noticed a sign-in from a new device and signed you out of all devices as a precaution." }],
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
    id: "bug-received",
    name: "Bug report received",
    mailbox: "support",
    description: "Confirm you got a problem report and are on it.",
    fields: [
      NAME,
      { key: "issue", label: "What they reported", default: "The problem you reported" },
      { key: "reference", label: "Reference", default: "{{ref}}" },
      { key: "eta", label: "When to expect an update (optional)", optional: true, default: "within 48 hours" },
    ],
    build: (f, app) =>
      mail("support", app, `We're on it: ${f.issue?.trim() || "your report"} (${f.reference?.trim() || "ref pending"})`, {
        preheader: "Thanks for the report — we're looking into it now.",
        eyebrow: "Recktube Support",
        heading: "Thanks — we're on it",
        intro: `${hi(f)} thanks for taking the time to report this. Our team is looking into it now.`,
        blocks: [
          { type: "stats", items: [{ label: "Reference", value: f.reference?.trim() || "—" }, { label: "Status", value: "Investigating", tone: "hot" }] },
          { type: "callout", title: "What you reported", text: f.issue?.trim() || "The problem you reported." },
          { type: "text", text: `We'll email you ${f.eta?.trim() || "as soon as we have an update"}. If you have screenshots or steps to reproduce it, just reply — it helps us fix it faster.\n\nThe Recktube team` },
        ],
      }),
  },
  {
    id: "feature-announcement",
    name: "New feature",
    mailbox: "support",
    description: "Tell a creator about something new they can use.",
    fields: [
      NAME,
      { key: "feature", label: "Feature name", default: "Channel Creator" },
      { key: "summary", label: "What it does", multiline: true, default: "Channel Creator builds your whole channel plan from live YouTube data — name, positioning, branding and your first 30 video ideas — in about a minute." },
      { key: "path", label: "Where it lives in the app", placeholder: "/channel-creator", default: "/channel-creator" },
    ],
    build: (f, app) => {
      const path = /^\/[a-z0-9\-/]*$/i.test(f.path?.trim() ?? "") ? f.path.trim() : "/dashboard";
      return mail("support", app, `New in Recktube: ${f.feature?.trim() || "a new feature"}`, {
        preheader: (f.summary ?? "").slice(0, 120),
        eyebrow: "What's new",
        heading: `Meet ${f.feature?.trim() || "something new"}`,
        intro: `${hi(f)} we just shipped something we think you'll love.`,
        blocks: [...paragraphs(f.summary ?? ""), { type: "text", text: "Give it a try and tell us what you think — just reply to this email.\n\nThe Recktube team" }],
        cta: { label: `Try ${f.feature?.trim() || "it"} now`, url: `${app}${path}` },
      });
    },
  },
  {
    id: "feedback-request",
    name: "Ask for feedback",
    mailbox: "support",
    description: "Ask a creator how Recktube is working for them.",
    fields: [NAME],
    build: (f, app) =>
      mail("support", app, "Quick question: how is Recktube working for you?", {
        preheader: "Two minutes of your feedback shapes what we build next.",
        eyebrow: "Your feedback",
        heading: "How's it going?",
        intro: `${hi(f)} you've been creating with Recktube for a little while now, and we'd love to hear how it's going.`,
        blocks: [
          {
            type: "steps",
            items: [
              { title: "What do you use most?", text: "Scripts, voice-overs, thumbnails, research — what saves you the most time?" },
              { title: "What slowed you down?", text: "Anything confusing, slow or missing?" },
              { title: "What should we build next?", text: "The one thing that would make Recktube indispensable for you." },
            ],
          },
          { type: "text", text: "Just hit reply — every answer is read by the team.\n\nThe Recktube team" },
        ],
      }),
  },
  {
    id: "maintenance-notice",
    name: "Planned maintenance",
    mailbox: "support",
    description: "Warn creators about scheduled downtime.",
    fields: [
      NAME,
      { key: "when", label: "When", default: "Sunday at 02:00 UTC" },
      { key: "duration", label: "How long", default: "about 30 minutes" },
      { key: "why", label: "What we're improving (optional)", multiline: true, optional: true, default: "We're upgrading our servers so video exports and generations run faster." },
    ],
    build: (f, app) =>
      mail("support", app, `Planned maintenance: ${f.when?.trim() || "soon"}`, {
        preheader: `Recktube will be briefly unavailable ${f.when?.trim() || "soon"}.`,
        eyebrow: "Service notice",
        heading: "Planned maintenance",
        intro: `${hi(f)} Recktube will be briefly unavailable while we make some improvements.`,
        blocks: [
          { type: "stats", items: [{ label: "When", value: f.when?.trim() || "—" }, { label: "Duration", value: f.duration?.trim() || "—" }] },
          ...paragraphs(f.why ?? ""),
          { type: "text", text: "Your projects are safe and nothing needs to be done on your side. Anything running at that moment will pick up again when we're back.\n\nThe Recktube team" },
        ],
      }),
  },
  {
    id: "youtube-reconnect",
    name: "Reconnect YouTube",
    mailbox: "support",
    description: "Ask a creator to reconnect their YouTube channel.",
    fields: [NAME, { key: "channel", label: "Channel name (optional)", optional: true, default: "" }],
    build: (f, app) =>
      mail("support", app, "Action needed: reconnect your YouTube channel", {
        preheader: "Publishing and analytics are paused until you reconnect.",
        eyebrow: "Action needed",
        heading: "Please reconnect YouTube",
        intro: `${hi(f)} Recktube lost access to your YouTube channel${f.channel?.trim() ? ` “${f.channel.trim()}”` : ""}. This usually happens after a password change or when access is removed in your Google account.`,
        blocks: [
          { type: "callout", title: "What's paused", text: "Publishing, scheduling and channel analytics are paused until you reconnect. Your projects and drafts are not affected." },
          { type: "text", text: "Reconnecting takes about 30 seconds.\n\nThe Recktube team" },
        ],
        cta: { label: "Reconnect YouTube", url: `${app}/youtube` },
      }),
  },
  {
    id: "credits-refilled",
    name: "Credits refilled",
    mailbox: "support",
    description: "Remind a creator their monthly credits are back.",
    fields: [NAME, { key: "amount", label: "Monthly credits", default: "500" }],
    build: (f, app) =>
      mail("support", app, `Your ${f.amount?.trim() || "monthly"} credits are back`, {
        preheader: "A fresh month of credits is ready in your account.",
        eyebrow: "Credits",
        heading: "Your credits are refilled",
        intro: `${hi(f)} your monthly credits have been topped back up — time to make something new.`,
        blocks: [
          { type: "stats", items: [{ label: "Balance", value: f.amount?.trim() || "—", tone: "good" }, { label: "Refills", value: "Every 30 days" }] },
          { type: "text", text: "Need an idea? Content Creator shows what's working in your niche right now.\n\nThe Recktube team" },
        ],
        cta: { label: "Find my next video", url: `${app}/content-creator` },
      }),
  },
  {
    id: "policy-update",
    name: "Policy update",
    mailbox: "support",
    description: "Notify creators that the Terms or Privacy Policy changed.",
    fields: [
      NAME,
      { key: "policy", label: "Which policy", default: "Privacy Policy" },
      { key: "date", label: "Effective date", default: "30 days from today" },
      { key: "summary", label: "What changed", multiline: true, default: "We now list every service provider that processes your data, and cached YouTube data is deleted after 30 days." },
    ],
    build: (f, app) =>
      mail("support", app, `We're updating our ${f.policy?.trim() || "policies"}`, {
        preheader: `Our ${f.policy?.trim() || "policies"} change on ${f.date?.trim() || "a future date"}.`,
        eyebrow: "Policy update",
        heading: `Updates to our ${f.policy?.trim() || "policies"}`,
        intro: `${hi(f)} we're updating our ${f.policy?.trim() || "policies"}. The changes take effect ${f.date?.trim() || "soon"}.`,
        blocks: [
          { type: "callout", title: "What changed", text: f.summary?.trim() || "A few clarifications." },
          { type: "text", text: "You don't need to do anything. By continuing to use Recktube after that date, you accept the updated version.\n\nThe Recktube team" },
        ],
        cta: { label: `Read the ${f.policy?.trim() || "policy"}`, url: `${app}${/terms/i.test(f.policy ?? "") ? "/terms" : "/privacy"}` },
      }),
  },
  {
    id: "account-deleted",
    name: "Account deleted",
    mailbox: "support",
    description: "Confirm an account and its data were deleted.",
    fields: [NAME],
    build: (f, app) =>
      mail("support", app, "Your Recktube account has been deleted", {
        preheader: "Your account and its data have been removed.",
        eyebrow: "Account notice",
        heading: "Your account is deleted",
        intro: `${hi(f)} as requested, your Recktube account and the data in it have been deleted. We're sorry to see you go.`,
        blocks: [{ type: "text", text: "If you ever want to come back, you're welcome to create a new account at any time. If you didn't ask for this, reply right away.\n\nThe Recktube team" }],
        cta: { label: "Visit Recktube", url: app },
      }),
  },
  {
    id: "password-help",
    name: "Help resetting password",
    mailbox: "security",
    description: "Walk someone through resetting their password.",
    fields: [NAME, { key: "email", label: "Their account email (optional)", optional: true, default: "" }],
    build: (f, app) =>
      mail("security", app, "How to reset your Recktube password", {
        preheader: "Reset your password in under a minute with a 6-digit code.",
        eyebrow: "Recktube Security",
        heading: "Resetting your password",
        intro: `${hi(f)} here's how to get back into your account:`,
        blocks: [
          {
            type: "steps",
            items: [
              { title: "Open the reset page", text: "Use the button below and enter your account email." },
              { title: "Enter the 6-digit code", text: "We email you a code that works for 15 minutes." },
              { title: "Choose a new password", text: "You'll be signed out on other devices for safety." },
            ],
          },
          { type: "text", text: "Never share your code with anyone — Recktube staff will never ask for it.\n\nRecktube Security" },
        ],
        cta: { label: "Reset my password", url: `${app}/forgot-password${f.email?.trim() ? `?email=${encodeURIComponent(f.email.trim())}` : ""}` },
      }),
  },
  {
    id: "custom",
    name: "Custom message",
    mailbox: "support",
    description: "Write anything, on the Recktube design.",
    fields: [
      NAME,
      { key: "subject", label: "Subject", default: "A message from Recktube" },
      { key: "heading", label: "Heading", default: "An update from Recktube" },
      { key: "message", label: "Message", multiline: true, default: "We wanted to share a quick update with you.\n\nThanks for creating with Recktube." },
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
  signer?: { signoff: string } | null,
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
    eyebrow: MAILBOX_SENDER[mailbox].name,
    heading: hi({ name: r.name ?? "" }),
    blocks: [
      ...paragraphs(r.message),
      { type: "text", text: signer?.signoff ?? MAILBOX_SENDER[mailbox].signoff },
      ...(quote ? ([{ type: "divider" }, { type: "text", text: `On ${when}, ${r.quotedFrom} wrote:\n\n${quote}${(r.quoted ?? "").length > 1500 ? "\n…" : ""}` }] as EmailBlock[]) : []),
    ],
  });
}
