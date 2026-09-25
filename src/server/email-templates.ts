/**
 * TubeRack email design system. Table-based, inline-styled HTML that renders
 * the same in Gmail, Outlook, Apple Mail and on phones, with a plain-text
 * twin for every message. All content is escaped; only https links are kept.
 */

const INK = "#0b0714";
const PRIMARY = "#5b21b6";
const PRIMARY_SOFT = "#ede9fe";
const TEXT = "#18181b";
const MUTED = "#52525b";
const FAINT = "#a1a1aa";
const LINE = "#e4e4e7";
const PAGE = "#f4f4f5";
const GOOD = "#15803d";
const GOOD_SOFT = "#dcfce7";
const HOT = "#c2410c";
const HOT_SOFT = "#ffedd5";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const esc = (v: string | number) =>
  String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** Only absolute http(s) or mailto links make it into an email. */
const safeUrl = (u: string) => (/^(https?:\/\/|mailto:)/i.test(u) ? u : "#");

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
export const num = (n: number) => compact.format(n);

export type EmailBlock =
  | { type: "text"; text: string }
  | { type: "heading"; text: string; note?: string }
  | { type: "stats"; items: { label: string; value: string; tone?: "good" | "hot" }[] }
  | { type: "hero-video"; rank?: number; title: string; channel: string; thumbnail: string; url: string; meta: string[]; badge?: string }
  | { type: "videos"; items: { rank?: number; title: string; channel: string; thumbnail: string; url: string; meta: string; badge?: string }[] }
  | { type: "chips"; label?: string; items: string[] }
  | { type: "agenda"; items: { day: string; date: string; title: string; detail?: string }[] }
  | { type: "callout"; title: string; text: string; action?: { label: string; url: string } }
  | { type: "steps"; items: { title: string; text: string }[] }
  | { type: "code"; text: string }
  | { type: "divider" };

export interface EmailLayout {
  /** Inbox preview line (hidden in the body). */
  preheader: string;
  /** Small label above the heading, e.g. "DAILY NICHE BRIEFING". */
  eyebrow?: string;
  heading: string;
  intro?: string;
  blocks?: EmailBlock[];
  cta?: { label: string; url: string };
  secondary?: { label: string; url: string };
  /** Why the reader got this email (+ how to turn it off). */
  reason: string;
  appUrl: string;
}

function button(label: string, url: string, kind: "primary" | "ghost" = "primary"): string {
  const bg = kind === "primary" ? PRIMARY : "#ffffff";
  const fg = kind === "primary" ? "#ffffff" : PRIMARY;
  const border = kind === "primary" ? PRIMARY : "#c4b5fd";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;margin:0 8px 8px 0"><tr><td style="border-radius:10px;background:${bg};border:1px solid ${border}">
<a href="${esc(safeUrl(url))}" style="display:inline-block;padding:13px 22px;font-family:${FONT};font-size:15px;font-weight:700;color:${fg};text-decoration:none;border-radius:10px">${esc(label)}</a></td></tr></table>`;
}

function badge(text: string, tone: "hot" | "good" | "brand" = "hot"): string {
  const [bg, fg] = tone === "good" ? [GOOD_SOFT, GOOD] : tone === "brand" ? [PRIMARY_SOFT, PRIMARY] : [HOT_SOFT, HOT];
  return `<span style="display:inline-block;padding:3px 8px;border-radius:999px;background:${bg};color:${fg};font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase">${esc(text)}</span>`;
}

function renderBlock(b: EmailBlock): string {
  switch (b.type) {
    case "text":
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${MUTED};white-space:pre-line">${esc(b.text)}</p>`;
    case "heading":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 12px"><tr>
<td style="font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${TEXT}">${esc(b.text)}</td>
${b.note ? `<td align="right" style="font-size:12px;color:${FAINT}">${esc(b.note)}</td>` : ""}</tr></table>`;
    case "stats": {
      const w = Math.floor(100 / Math.max(1, b.items.length));
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;border:1px solid ${LINE};border-radius:14px;border-collapse:separate"><tr>
${b.items
  .map(
    (s, i) => `<td width="${w}%" valign="top" style="padding:16px 14px;${i ? `border-left:1px solid ${LINE};` : ""}">
<div style="font-size:24px;font-weight:800;color:${s.tone === "good" ? GOOD : s.tone === "hot" ? HOT : TEXT};line-height:1.1">${esc(s.value)}</div>
<div style="margin-top:4px;font-size:12px;color:${MUTED}">${esc(s.label)}</div></td>`,
  )
  .join("")}</tr></table>`;
    }
    case "hero-video":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;border:1px solid ${LINE};border-radius:16px;border-collapse:separate;overflow:hidden">
<tr><td style="padding:0"><a href="${esc(safeUrl(b.url))}" style="text-decoration:none"><img src="${esc(safeUrl(b.thumbnail))}" width="560" alt="${esc(b.title)}" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:16px 16px 0 0"></a></td></tr>
<tr><td style="padding:16px 18px 18px">
<div style="margin-bottom:8px">${b.rank ? badge(`#${b.rank} in your niche`, "brand") + " " : ""}${b.badge ? badge(b.badge) : ""}</div>
<a href="${esc(safeUrl(b.url))}" style="font-size:19px;line-height:1.35;font-weight:800;color:${TEXT};text-decoration:none">${esc(b.title)}</a>
<div style="margin-top:6px;font-size:13px;color:${MUTED}">${esc(b.channel)}</div>
<div style="margin-top:10px;font-size:13px;color:${TEXT}">${b.meta.map((m) => `<span style="display:inline-block;margin:0 14px 4px 0;font-weight:600">${esc(m)}</span>`).join("")}</div>
</td></tr></table>`;
    case "videos":
      return b.items
        .map(
          (v) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px"><tr>
${v.rank ? `<td width="28" valign="top" style="padding-top:6px;font-size:16px;font-weight:800;color:${FAINT}">${v.rank}</td>` : ""}
<td width="150" valign="top" style="padding-right:14px"><a href="${esc(safeUrl(v.url))}"><img src="${esc(safeUrl(v.thumbnail))}" width="150" alt="" style="display:block;width:150px;height:auto;border:0;border-radius:10px"></a></td>
<td valign="top">
${v.badge ? `<div style="margin-bottom:4px">${badge(v.badge)}</div>` : ""}
<a href="${esc(safeUrl(v.url))}" style="font-size:15px;line-height:1.35;font-weight:700;color:${TEXT};text-decoration:none">${esc(v.title)}</a>
<div style="margin-top:4px;font-size:12px;color:${MUTED}">${esc(v.channel)}</div>
<div style="margin-top:4px;font-size:12px;font-weight:600;color:${TEXT}">${esc(v.meta)}</div>
</td></tr></table>`,
        )
        .join("");
    case "chips":
      return `${b.label ? `<p style="margin:0 0 8px;font-size:13px;color:${MUTED}">${esc(b.label)}</p>` : ""}<div style="margin:0 0 16px">${b.items
        .map((c) => `<span style="display:inline-block;margin:0 6px 8px 0;padding:7px 12px;border-radius:999px;background:${PRIMARY_SOFT};color:${PRIMARY};font-size:13px;font-weight:700">${esc(c)}</span>`)
        .join("")}</div>`;
    case "agenda":
      return b.items
        .map(
          (a) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;border:1px solid ${LINE};border-radius:12px;border-collapse:separate"><tr>
<td width="64" align="center" valign="middle" style="padding:12px 8px;background:${PRIMARY_SOFT};border-radius:12px 0 0 12px">
<div style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:${PRIMARY}">${esc(a.day)}</div>
<div style="font-size:14px;font-weight:800;color:${TEXT};margin-top:2px">${esc(a.date)}</div></td>
<td valign="middle" style="padding:12px 16px"><div style="font-size:15px;font-weight:700;color:${TEXT}">${esc(a.title)}</div>
${a.detail ? `<div style="margin-top:3px;font-size:12px;color:${MUTED}">${esc(a.detail)}</div>` : ""}</td></tr></table>`,
        )
        .join("");
    case "callout":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 20px;border-radius:14px;background:${INK}"><tr><td style="padding:20px 22px">
<div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#c4b5fd">${esc(b.title)}</div>
<div style="margin-top:8px;font-size:15px;line-height:1.6;color:#ffffff">${esc(b.text)}</div>
${b.action ? `<div style="margin-top:14px"><a href="${esc(safeUrl(b.action.url))}" style="font-size:14px;font-weight:700;color:#c4b5fd;text-decoration:none">${esc(b.action.label)} &rarr;</a></div>` : ""}
</td></tr></table>`;
    case "steps":
      return b.items
        .map(
          (s, i) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px"><tr>
<td width="40" valign="top"><div style="width:28px;height:28px;line-height:28px;border-radius:999px;background:${PRIMARY};color:#fff;text-align:center;font-size:13px;font-weight:800">${i + 1}</div></td>
<td valign="top"><div style="font-size:15px;font-weight:700;color:${TEXT}">${esc(s.title)}</div><div style="margin-top:3px;font-size:14px;line-height:1.55;color:${MUTED}">${esc(s.text)}</div></td></tr></table>`,
        )
        .join("");
    case "code":
      return `<div style="margin:8px 0 20px;padding:16px;border-radius:12px;background:${PAGE};border:1px dashed ${LINE};text-align:center;font-family:Menlo,Consolas,monospace;font-size:26px;font-weight:800;letter-spacing:.3em;color:${TEXT}">${esc(b.text)}</div>`;
    case "divider":
      return `<div style="margin:24px 0;border-top:1px solid ${LINE}"></div>`;
  }
}

function blockText(b: EmailBlock): string {
  switch (b.type) {
    case "text":
      return b.text;
    case "heading":
      return `\n${b.text.toUpperCase()}${b.note ? ` (${b.note})` : ""}`;
    case "stats":
      return b.items.map((s) => `${s.label}: ${s.value}`).join(" · ");
    case "hero-video":
      return `${b.rank ? `#${b.rank} ` : ""}${b.title} — ${b.channel}\n${b.meta.join(" · ")}\n${b.url}`;
    case "videos":
      return b.items.map((v) => `${v.rank ? `${v.rank}. ` : "• "}${v.title} — ${v.channel} · ${v.meta}${v.badge ? ` · ${v.badge}` : ""}\n  ${v.url}`).join("\n");
    case "chips":
      return `${b.label ? `${b.label} ` : ""}${b.items.join(", ")}`;
    case "agenda":
      return b.items.map((a) => `• ${a.day} ${a.date} — ${a.title}${a.detail ? ` (${a.detail})` : ""}`).join("\n");
    case "callout":
      return `${b.title}: ${b.text}${b.action ? `\n${b.action.label}: ${b.action.url}` : ""}`;
    case "steps":
      return b.items.map((s, i) => `${i + 1}. ${s.title} — ${s.text}`).join("\n");
    case "code":
      return b.text;
    case "divider":
      return "—";
  }
}

/** Render a full email: { html, text }. */
export function renderEmail(e: EmailLayout): { html: string; text: string } {
  const app = e.appUrl.replace(/\/$/, "");
  const blocks = e.blocks ?? [];
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<title>${esc(e.heading)}</title>
<style>@media (max-width:620px){.wrap{width:100%!important}.pad{padding:24px 20px!important}h1{font-size:24px!important}}</style></head>
<body style="margin:0;padding:0;background:${PAGE};font-family:${FONT};color:${TEXT};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(e.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px">
<tr><td style="padding:0 4px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td><a href="${esc(safeUrl(app))}" style="text-decoration:none"><span style="display:inline-block;width:30px;height:30px;line-height:30px;border-radius:9px;background:${INK};color:#fff;text-align:center;font-size:14px;font-weight:900;vertical-align:middle">&#9654;</span><span style="margin-left:9px;font-size:16px;font-weight:800;color:${TEXT};vertical-align:middle">TubeRack</span></a></td>
${e.eyebrow ? `<td align="right" style="font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:${FAINT}">${esc(e.eyebrow)}</td>` : ""}
</tr></table></td></tr>
<tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:20px;overflow:hidden">
<div style="height:6px;background:${PRIMARY};background-image:linear-gradient(90deg,${INK},${PRIMARY});border-radius:20px 20px 0 0"></div>
<div class="pad" style="padding:34px 36px 30px">
<h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;font-weight:800;letter-spacing:-.01em;color:${TEXT}">${esc(e.heading)}</h1>
${e.intro ? `<p style="margin:0 0 22px;font-size:16px;line-height:1.6;color:${MUTED};white-space:pre-line">${esc(e.intro)}</p>` : ""}
${blocks.map(renderBlock).join("\n")}
${e.cta || e.secondary ? `<div style="margin-top:22px">${e.cta ? button(e.cta.label, e.cta.url) : ""}${e.secondary ? button(e.secondary.label, e.secondary.url, "ghost") : ""}</div>` : ""}
</div></td></tr>
<tr><td style="padding:22px 12px 8px;text-align:center;font-size:12px;line-height:1.6;color:${FAINT}">
${esc(e.reason)}<br>
<a href="${esc(safeUrl(`${app}/settings?tab=notifications`))}" style="color:${MUTED};text-decoration:underline">Email preferences</a> &nbsp;·&nbsp; <a href="${esc(safeUrl(app))}" style="color:${MUTED};text-decoration:underline">Open TubeRack</a>
<div style="margin-top:10px;color:#d4d4d8">TubeRack — plan, make and grow your YouTube channel.</div>
</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    e.heading.toUpperCase(),
    e.intro ?? "",
    ...blocks.map(blockText),
    e.cta ? `${e.cta.label}: ${e.cta.url}` : "",
    e.secondary ? `${e.secondary.label}: ${e.secondary.url}` : "",
    "—",
    e.reason,
    `Email preferences: ${app}/settings?tab=notifications`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { html, text };
}
